import { COUPLE_CHANNEL, coupleChannelName } from "@/lib/realtime/channels";
import { micErrorKind } from "./voiceSession";
import { openResilientChannel } from "@/lib/realtime/resilientChannel";

/**
 * Direct voice: the two browsers connect to each other with WebRTC (no voice
 * provider in between). Same interface and states as the Daily session
 * (lib/voice/voiceSession.js), so the store and UI don't care which is used.
 *
 *   signaling  the couple's PRIVATE `voice` topic (RLS: only the two members can
 *              join/send). Carries hello/offer/answer/ICE/mic/bye — never audio.
 *   media      one audio transceiver, browser-to-browser, encrypted (DTLS-SRTP).
 *              A public STUN server only helps each browser discover its address.
 *   mic        OFF until the user turns it on; turning it off stops the track
 *              (sender.replaceTrack(null)) — no renegotiation needed either way.
 *   speaking   the partner's real audio level, from a Web Audio analyser.
 *
 * Roles: the partner with the smaller user id starts the connection
 * ("initiator"); the other answers. Each page load has its own session id, so a
 * refresh on either side cleanly replaces the old connection.
 *
 * ICE servers come from the server (/api/voice/ice): STUN, plus a TURN relay
 * when one is configured (lib/voice/ice.server.js). Without TURN, some strict
 * networks (e.g. symmetric NAT on mobile data) can't connect directly; that
 * shows as "Couldn't connect voice on this network" — never a fake connection.
 */
const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
const SPEAKING_THRESHOLD = 0.04;
const SPEAKING_HOLD_MS = 450;
const LEVEL_INTERVAL_MS = 120;
const MAX_ICE_RESTARTS = 2;
const CONNECT_TIMEOUT_MS = 20_000;
// A call that stays "disconnected" this long (e.g. the partner's page vanished
// without saying goodbye) is torn down and re-handshaken, so it can't stay stuck.
const STALL_TIMEOUT_MS = 8_000;

const newSessionId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const defaultPeerFactory = (config) => new RTCPeerConnection(config);

export function createPeerVoiceSession({ getSupabase, getIceServers = async () => DEFAULT_ICE_SERVERS, coupleId, userId, partnerId, onState, createPeerConnection = defaultPeerFactory }) {
  const sid = newSessionId();
  const initiator = userId < partnerId;
  let signaling = null;
  const channel = () => signaling?.channel ?? null;
  let supabase = null;
  let live = false;
  let destroyed = false;
  let pc = null;
  let partnerSid = null;
  // One id per peer connection attempt (made by the initiator, adopted by the
  // other side from the offer). A new id means "drop the old connection and
  // build a fresh one"; ICE restarts keep it. Signals carrying another id
  // belong to a connection that is already gone and are ignored.
  let cid = null;
  let pendingIce = [];
  let micTrack = null;
  let micOn = false;
  let partnerMicOn = false;
  let iceRestarts = 0;
  let audioEl = null;
  let audioContext = null;
  let analyser = null;
  let levelTimer = null;
  let connectTimer = null;
  let stallTimer = null;
  let iceServers = DEFAULT_ICE_SERVERS;
  let speaking = false;
  let speakingUntil = 0;

  const emit = (patch) => !destroyed && onState(patch);
  const send = (type, payload = {}) => {
    if (!live || !channel()) return;
    channel().send({ type: "broadcast", event: "signal", payload: { type, from: userId, sid, to: partnerSid, ...payload } }).catch(() => {});
  };

  function partnerState() {
    const connected = pc?.connectionState === "connected";
    return { connected, muted: !partnerMicOn, speaking: connected && partnerMicOn && speaking };
  }
  const refreshPartner = () => emit({ partner: partnerState() });

  // ── Remote audio ────────────────────────────────────────────────────────
  function playRemote(stream) {
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "");
      audioEl.dataset.ourPlaceVoice = "partner";
    }
    audioEl.srcObject = stream;
    audioEl.play().then(
      () => emit({ audioBlocked: false }),
      (error) => error?.name === "NotAllowedError" && emit({ audioBlocked: true }),
    );
    startLevelMeter(stream);
  }

  function startLevelMeter(stream) {
    stopLevelMeter();
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      audioContext ??= new AudioContextClass();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      levelTimer = setInterval(() => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += ((value - 128) / 128) ** 2;
        const level = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (level > SPEAKING_THRESHOLD) speakingUntil = now + SPEAKING_HOLD_MS;
        const next = now < speakingUntil;
        if (next !== speaking) {
          speaking = next;
          refreshPartner();
        }
      }, LEVEL_INTERVAL_MS);
    } catch {
      // No meter → no speaking indicator; the call itself is unaffected.
    }
  }

  function stopLevelMeter() {
    clearInterval(levelTimer);
    levelTimer = null;
    analyser = null;
    if (speaking) {
      speaking = false;
      refreshPartner();
    }
  }

  // ── Peer connection ─────────────────────────────────────────────────────
  function closePeer() {
    clearTimeout(connectTimer);
    connectTimer = null;
    clearTimeout(stallTimer);
    stallTimer = null;
    stopLevelMeter();
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        // already closed
      }
    }
    pc = null;
    pendingIce = [];
    if (audioEl) audioEl.srcObject = null;
    refreshPartner();
  }

  function createPeer() {
    closePeer();
    iceRestarts = 0;
    pc = createPeerConnection({ iceServers });
    pc.onicecandidate = ({ candidate }) => candidate && send("ice", { cid, candidate: candidate.toJSON ? candidate.toJSON() : candidate });
    pc.ontrack = ({ streams, track }) => playRemote(streams?.[0] ?? new MediaStream([track]));
    pc.onconnectionstatechange = () => {
      const state = pc?.connectionState;
      if (state === "connected") {
        clearTimeout(connectTimer);
        clearTimeout(stallTimer);
        iceRestarts = 0;
        emit({ status: "connected", error: null });
      } else if (state === "disconnected") {
        emit({ status: "reconnecting" });
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          if (destroyed || !pc || pc.connectionState === "connected") return;
          // Start over: voice is available again, and a fresh hello lets the
          // partner (if they're still here) set up a new connection.
          partnerSid = null;
          closePeer();
          emit({ status: "connected" });
          if (live) send("hello", { mic: micOn, restart: true });
        }, STALL_TIMEOUT_MS);
      } else if (state === "failed") {
        if (initiator && iceRestarts < MAX_ICE_RESTARTS) {
          iceRestarts += 1;
          emit({ status: "reconnecting" });
          makeOffer({ iceRestart: true });
        } else {
          // Voice stays available; the HUD offers a retry.
          emit({ status: "connected", error: "voice_unreachable" });
        }
      }
      refreshPartner();
    };
    clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
      if (pc && pc.connectionState !== "connected") emit({ error: "voice_unreachable" });
    }, CONNECT_TIMEOUT_MS);
    return pc;
  }

  // One audio transceiver per connection (added by the initiator).
  const audioSender = () => pc?.getTransceivers?.()[0]?.sender ?? null;

  async function attachMic() {
    const sender = audioSender();
    if (sender) await sender.replaceTrack(micOn ? micTrack : null).catch(() => {});
  }

  async function makeOffer({ iceRestart = false } = {}) {
    if (!pc) return;
    try {
      const offer = await pc.createOffer({ iceRestart });
      await pc.setLocalDescription(offer);
      send("offer", { cid, description: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription });
    } catch {
      emit({ error: "voice_failed" });
    }
  }

  async function startAsInitiator() {
    cid = newSessionId();
    createPeer();
    pc.addTransceiver("audio", { direction: "sendrecv" });
    await attachMic();
    await makeOffer();
  }

  async function flushIce() {
    for (const candidate of pendingIce.splice(0)) await pc?.addIceCandidate(candidate).catch(() => {});
  }

  // ── Signaling ───────────────────────────────────────────────────────────
  // Signals from an older app version carry no connection id; accept those.
  const sameConnection = (message) => message.cid === undefined || message.cid === cid;

  async function onSignal(message) {
    if (!message || message.from !== partnerId || destroyed) return; // only the partner (never our own other tabs)
    if (message.to && message.to !== sid) return; // addressed to another of our tabs
    switch (message.type) {
      case "hello": {
        partnerMicOn = Boolean(message.mic);
        // `restart`: the partner dropped its connection (network change, a stalled
        // call, Retry) while keeping its session — ours is dead too, so rebuild.
        const isNew = message.sid !== partnerSid || Boolean(message.restart);
        partnerSid = message.sid;
        if (!message.reply) send("hello", { reply: true, mic: micOn });
        if (isNew || !pc) {
          if (initiator) await startAsInitiator();
          else {
            closePeer();
            cid = null;
          }
        }
        refreshPartner();
        break;
      }
      case "offer": {
        if (initiator) return;
        if (message.sid !== partnerSid) {
          partnerSid = message.sid; // their page reloaded: start over
          closePeer();
        }
        if (message.cid !== undefined && message.cid !== cid) {
          closePeer(); // a fresh connection, not a renegotiation of the old one
          cid = message.cid;
        }
        if (!pc) createPeer();
        try {
          await pc.setRemoteDescription(message.description);
          await flushIce();
          await attachMic();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send("answer", { cid, description: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription });
        } catch {
          emit({ error: "voice_failed" });
        }
        break;
      }
      case "answer": {
        if (!initiator || !pc || message.sid !== partnerSid || !sameConnection(message)) return;
        try {
          await pc.setRemoteDescription(message.description);
          await flushIce();
        } catch {
          emit({ error: "voice_failed" });
        }
        break;
      }
      case "ice": {
        if (message.sid !== partnerSid || !message.candidate || !sameConnection(message)) return;
        if (pc?.remoteDescription) await pc.addIceCandidate(message.candidate).catch(() => {});
        else pendingIce.push(message.candidate);
        break;
      }
      case "mic": {
        partnerMicOn = Boolean(message.on);
        refreshPartner();
        break;
      }
      case "bye": {
        if (message.sid !== partnerSid) return;
        partnerSid = null;
        partnerMicOn = false;
        closePeer();
        cid = null;
        break;
      }
      default:
        break;
    }
  }

  function releaseMic() {
    micTrack?.stop();
    micTrack = null;
  }

  const api = {
    async connect() {
      if (destroyed || signaling) return;
      if (createPeerConnection === defaultPeerFactory && typeof globalThis.RTCPeerConnection === "undefined") {
        emit({ status: "unavailable", error: "voice_unsupported" });
        return;
      }
      emit({ status: "connecting", error: null });
      try {
        // Relay servers first, so even the first connection can use TURN.
        const [client, servers] = await Promise.all([getSupabase(), Promise.resolve(getIceServers()).catch(() => null)]);
        supabase = client;
        if (Array.isArray(servers) && servers.length) iceServers = servers;
      } catch {
        emit({ status: "error", error: "voice_failed" });
        return;
      }
      if (destroyed) return;
      signaling = openResilientChannel({
        supabase,
        topic: coupleChannelName(coupleId, COUPLE_CHANNEL.VOICE),
        options: { config: { private: true, broadcast: { self: false, ack: false } } },
        area: "voice",
        bind: (signalChannel) => signalChannel.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload)),
        onStatus: (status) => {
          if (destroyed) return;
          if (status === "SUBSCRIBED") {
            live = true;
            // Voice is available (listening); the partner connects when they're here.
            // Also after a signaling hiccup over a healthy call: never stay "reconnecting".
            emit({ status: "connected" });
            send("hello", { mic: micOn });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            live = false;
            emit({ status: "reconnecting" });
          }
        },
      });
    },

    async setMic(enabled) {
      if (destroyed) return;
      if (!enabled) {
        micOn = false;
        await attachMic();
        releaseMic();
        emit({ micPending: false, micEnabled: false });
        send("mic", { on: false });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        emit({ micUnsupported: true, micEnabled: false });
        return;
      }
      emit({ micPending: true, permissionDenied: false, error: null });
      try {
        micTrack = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })).getAudioTracks()[0];
        if (destroyed) {
          releaseMic();
          return;
        }
        micOn = true;
        await attachMic();
        emit({ micPending: false, micEnabled: true });
        send("mic", { on: true });
      } catch (error) {
        releaseMic();
        const kind = micErrorKind(error);
        emit({ micPending: false, micEnabled: false, permissionDenied: kind === "permission", error: kind === "permission" ? null : `mic_${kind}` });
      }
    },

    unlockAudio() {
      audioContext?.resume?.().catch(() => {});
      audioEl?.play().then(
        () => emit({ audioBlocked: false }),
        () => {},
      );
    },

    retryNow() {
      if (destroyed || !live) return;
      partnerSid = null;
      closePeer();
      emit({ error: null });
      send("hello", { mic: micOn, restart: true });
    },

    async destroy() {
      if (destroyed) return;
      send("bye");
      destroyed = true;
      live = false;
      closePeer();
      releaseMic();
      audioEl = null;
      audioContext?.close?.().catch(() => {});
      audioContext = null;
      if (signaling) await signaling.close();
      signaling = null;
    },
  };
  return api;
}
