import { micErrorKind } from "./voiceSession";

/**
 * Agora voice: both browsers join the couple's private Agora channel and Agora's
 * network carries the audio — the way multiplayer games do voice. It handles
 * mobile data, strict NATs and switching between Wi-Fi and data on its own, so
 * there is no direct connection to negotiate. Same interface and states as the
 * other sessions (lib/voice/voiceSession.js), so the store and UI don't care.
 *
 *   join     credentials from /api/voice/agora (channel + token signed by our server)
 *   mic      OFF until the user turns it on; on = capture + publish, off =
 *            unpublish + release the microphone
 *   partner  joined/left and published/unpublished from Agora's own events;
 *            speaking from the partner's real audio level
 *
 * The SDK is loaded lazily (only once the server has handed out credentials).
 */
const SPEAKING_THRESHOLD = 0.05;
const SPEAKING_HOLD_MS = 450;
const LEVEL_INTERVAL_MS = 150;
const RETRY_DELAYS_MS = [2000, 5000, 15000];

const AGORA_MIC_ERRORS = {
  PERMISSION_DENIED: "NotAllowedError",
  DEVICE_NOT_FOUND: "NotFoundError",
  NOT_READABLE: "NotReadableError",
};

/** Maps an Agora error (code) or a plain DOMException (name) onto micErrorKind. */
export function agoraMicErrorKind(error) {
  const code = error?.code ?? "";
  const nested = error?.originError ?? error?.data?.originError;
  if (AGORA_MIC_ERRORS[code]) return micErrorKind({ name: AGORA_MIC_ERRORS[code] });
  if (nested?.name) return micErrorKind(nested);
  return micErrorKind(error);
}

export function createAgoraVoiceSession({ fetchAccess, partnerId, onState, loadAgora = () => import("agora-rtc-sdk-ng").then((module) => module.default ?? module) }) {
  let AgoraRTC = null;
  let client = null;
  let micTrack = null;
  let micOn = false;
  let destroyed = false;
  let joining = null;
  let retryTimer = null;
  let retryCount = 0;
  let levelTimer = null;
  let speaking = false;
  let speakingUntil = 0;
  let audioBlocked = false;

  const emit = (patch) => !destroyed && onState(patch);
  const partnerUser = () => client?.remoteUsers?.find((user) => String(user.uid) === partnerId) ?? null;

  function partnerState() {
    const user = partnerUser();
    if (!user) return { connected: false, muted: true, speaking: false };
    const muted = !user.hasAudio;
    return { connected: true, muted, speaking: !muted && speaking };
  }
  const refreshPartner = () => emit({ partner: partnerState() });

  function startLevelMeter() {
    if (levelTimer) return;
    levelTimer = setInterval(() => {
      const level = partnerUser()?.audioTrack?.getVolumeLevel?.() ?? 0;
      const now = performance.now();
      if (level > SPEAKING_THRESHOLD) speakingUntil = now + SPEAKING_HOLD_MS;
      const next = now < speakingUntil;
      if (next !== speaking) {
        speaking = next;
        refreshPartner();
      }
    }, LEVEL_INTERVAL_MS);
  }

  function stopLevelMeter() {
    clearInterval(levelTimer);
    levelTimer = null;
    speaking = false;
  }

  function playPartner() {
    const track = partnerUser()?.audioTrack;
    if (!track) return;
    try {
      track.play();
    } catch {
      // Autoplay refusal is reported through AgoraRTC.onAutoplayFailed.
    }
    startLevelMeter();
  }

  // ── Agora events ───────────────────────────────────────────────────────
  const handlers = {
    "user-joined": () => refreshPartner(),
    "user-left": (user) => {
      if (String(user.uid) === partnerId) stopLevelMeter();
      refreshPartner();
    },
    "user-published": async (user, mediaType) => {
      if (mediaType !== "audio" || String(user.uid) !== partnerId) return;
      try {
        await client.subscribe(user, "audio");
        playPartner();
      } catch {
        // A later publish (or a reconnect) subscribes again.
      }
      refreshPartner();
    },
    "user-unpublished": (user, mediaType) => {
      if (mediaType === "audio" && String(user.uid) === partnerId) stopLevelMeter();
      refreshPartner();
    },
    "connection-state-change": (current, _previous, reason) => {
      if (current === "CONNECTED") emit({ status: "connected", error: null });
      else if (current === "RECONNECTING") emit({ status: "reconnecting" });
      else if (current === "DISCONNECTED" && reason !== "LEAVE") {
        // Kicked, token expired or the network gave up: rejoin in the background.
        emit({ status: "reconnecting" });
        scheduleRetry();
      }
      refreshPartner();
    },
    "token-privilege-will-expire": () => renewToken(),
    "token-privilege-did-expire": () => scheduleRetry(),
  };

  async function renewToken() {
    try {
      const access = await fetchAccess();
      await client?.renewToken(access.token);
    } catch {
      // If renewal fails the channel reports token-privilege-did-expire → rejoin.
    }
  }

  function scheduleRetry() {
    if (destroyed || retryTimer) return;
    if (retryCount >= RETRY_DELAYS_MS.length) {
      emit({ status: "connected", error: "voice_unreachable" }); // the HUD offers Retry
      return;
    }
    const delay = RETRY_DELAYS_MS[retryCount];
    retryCount += 1;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      await leaveChannel();
      join();
    }, delay);
  }

  async function leaveChannel() {
    stopLevelMeter();
    if (!client) return;
    const old = client;
    client = null;
    for (const [event, handler] of Object.entries(handlers)) old.off?.(event, handler);
    await old.leave().catch(() => {});
  }

  async function join() {
    if (destroyed || joining) return joining;
    joining = (async () => {
      emit({ status: client ? "reconnecting" : "connecting" });
      let access;
      try {
        access = await fetchAccess();
      } catch (error) {
        if (error?.code === "voice_unavailable") emit({ status: "unavailable", error: "voice_unavailable" });
        else scheduleRetry();
        return;
      }
      try {
        AgoraRTC ??= await loadAgora();
        if (destroyed) return;
        AgoraRTC.setLogLevel?.(3); // errors only
        AgoraRTC.disableLogUpload?.();
        AgoraRTC.onAutoplayFailed = () => {
          audioBlocked = true;
          emit({ audioBlocked: true });
        };
        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        for (const [event, handler] of Object.entries(handlers)) client.on(event, handler);
        await client.join(access.appId, access.channel, access.token, access.uid);
        if (destroyed) return;
        retryCount = 0;
        emit({ status: "connected", error: null });
        // The partner may already be in the channel (and talking).
        for (const user of client.remoteUsers ?? []) if (user.hasAudio) await handlers["user-published"](user, "audio");
        if (micOn && micTrack) await client.publish(micTrack).catch(() => {});
        refreshPartner();
      } catch {
        if (!destroyed) scheduleRetry();
      }
    })().finally(() => {
      joining = null;
    });
    return joining;
  }

  function releaseMic() {
    micTrack?.close?.();
    micTrack = null;
  }

  return {
    async connect() {
      if (destroyed) return;
      await join();
    },

    async setMic(enabled) {
      if (destroyed) return;
      if (!enabled) {
        micOn = false;
        if (micTrack && client) await client.unpublish(micTrack).catch(() => {});
        releaseMic();
        emit({ micPending: false, micEnabled: false });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        emit({ micUnsupported: true, micEnabled: false });
        return;
      }
      emit({ micPending: true, permissionDenied: false, error: null });
      try {
        AgoraRTC ??= await loadAgora();
        micTrack = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true, encoderConfig: "speech_standard" });
        if (destroyed) {
          releaseMic();
          return;
        }
        micOn = true;
        if (client?.connectionState === "CONNECTED") await client.publish(micTrack);
        emit({ micPending: false, micEnabled: true });
      } catch (error) {
        releaseMic();
        micOn = false;
        const kind = agoraMicErrorKind(error);
        emit({ micPending: false, micEnabled: false, permissionDenied: kind === "permission", error: kind === "permission" ? null : `mic_${kind}` });
      }
    },

    unlockAudio() {
      if (!audioBlocked) return;
      audioBlocked = false;
      playPartner();
      emit({ audioBlocked: false });
    },

    async retryNow() {
      if (destroyed) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      retryCount = 0;
      emit({ error: null });
      await leaveChannel();
      await join();
    },

    async destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(retryTimer);
      retryTimer = null;
      if (micTrack && client) await client.unpublish(micTrack).catch(() => {});
      releaseMic();
      await leaveChannel();
      if (AgoraRTC) AgoraRTC.onAutoplayFailed = null;
    },
  };
}
