/**
 * The couple's voice connection (Daily.co), encapsulated. One session per page,
 * shared by every space (living room today; game rooms and the Range Room
 * later), so moving between spaces never reconnects voice.
 *
 *   const session = createVoiceSession({ fetchAccess, partnerId, onState })
 *   session.connect()        join the couple room — listening only, mic OFF
 *   session.setMic(true)     ask for the microphone (only now) and transmit
 *   session.setMic(false)    stop transmitting AND release the microphone
 *   session.unlockAudio()    retry playback after a user gesture (autoplay rules)
 *   session.destroy()        leave, stop every track, remove every listener/timer
 *
 * onState receives patches for the voice store:
 *   status   "connecting" | "connected" | "reconnecting" | "disconnected" | "unavailable" | "error"
 *   micEnabled, micPending, permissionDenied, micUnsupported, audioBlocked, error
 *   partner  { connected, muted, speaking }
 *
 * Daily is loaded lazily (only after the server confirms voice is configured),
 * and nothing is recorded, stored or transcribed — it's a live call only.
 */
const SPEAKING_THRESHOLD = 0.03;
const SPEAKING_HOLD_MS = 450;
const AUDIO_LEVEL_INTERVAL_MS = 150;
const RETRY_DELAYS_MS = [2000, 5000, 15000];

/** Developer diagnostics (never shown to users; no tokens or URLs logged). */
function debugVoice(stage, detail) {
  if (process.env.NODE_ENV !== "production") console.warn(`[our-place:voice] ${stage}`, detail?.errorMsg ?? detail?.error?.type ?? detail?.message ?? detail ?? "");
}

/** Daily errors that only the account owner can fix (billing, plan, disabled domain). */
const ACCOUNT_ERRORS = /payment|billing|account|not-allowed|domain/i;
export function isAccountProblem(detail) {
  const text = `${detail?.errorMsg ?? ""} ${detail?.error?.type ?? ""} ${detail?.error?.msg ?? ""}`;
  return ACCOUNT_ERRORS.test(text);
}

export function micErrorKind(error) {
  const name = error?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no_device";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "unknown";
}

export function createVoiceSession({ fetchAccess, partnerId, onState, loadDaily = () => import("@daily-co/daily-js") }) {
  let call = null;
  let micTrack = null;
  let audioEl = null;
  let partnerSessionId = null;
  let speakingUntil = 0;
  let speaking = false;
  let destroyed = false;
  let joining = null;
  let retryTimer = null;
  let retryCount = 0;
  const cleanups = [];

  const emit = (patch) => !destroyed && onState(patch);

  function partnerState() {
    const participants = call?.participants?.() ?? {};
    const partner = Object.values(participants).find((p) => !p.local && p.user_id === partnerId);
    partnerSessionId = partner?.session_id ?? null;
    if (!partner) return { connected: false, muted: true, speaking: false };
    const audio = partner.tracks?.audio;
    const muted = !audio || audio.state === "off" || audio.state === "blocked";
    return { connected: true, muted, speaking: !muted && speaking };
  }

  function attachPartnerAudio() {
    const participants = call?.participants?.() ?? {};
    const partner = Object.values(participants).find((p) => !p.local && p.user_id === partnerId);
    const track = partner?.tracks?.audio?.state === "playable" ? partner.tracks.audio.persistentTrack : null;
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "");
      audioEl.dataset.ourPlaceVoice = "partner";
    }
    const current = audioEl.srcObject?.getAudioTracks?.()[0] ?? null;
    if (track && current !== track) {
      audioEl.srcObject = new MediaStream([track]);
      audioEl.play().then(
        () => emit({ audioBlocked: false }),
        (error) => error?.name === "NotAllowedError" && emit({ audioBlocked: true }),
      );
    } else if (!track && current) {
      audioEl.srcObject = null;
    }
  }

  const refreshPartner = () => {
    attachPartnerAudio();
    emit({ partner: partnerState() });
  };

  function on(event, handler) {
    call.on(event, handler);
    cleanups.push(() => call?.off(event, handler));
  }

  function scheduleRetry() {
    if (destroyed || retryTimer || retryCount >= RETRY_DELAYS_MS.length) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryCount += 1;
      api.connect();
    }, RETRY_DELAYS_MS[retryCount]);
  }

  async function teardownCall() {
    for (const cleanup of cleanups.splice(0)) cleanup();
    stopMicTrack();
    const current = call;
    call = null;
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl = null;
    }
    if (current) {
      try {
        await current.leave();
      } catch {
        // already left
      }
      try {
        await current.destroy();
      } catch {
        // already destroyed
      }
    }
  }

  function stopMicTrack() {
    micTrack?.stop();
    micTrack = null;
  }

  let failing = null;
  /** One failure path for both Daily's "error" event and a rejected join(). */
  function failed(detail) {
    if (failing) return failing;
    const accountProblem = isAccountProblem(detail);
    failing = teardownCall().then(() => {
      failing = null;
      const offline = { micEnabled: false, micPending: false, partner: { connected: false, muted: true, speaking: false } };
      if (accountProblem) {
        emit({ status: "unavailable", error: "voice_account", ...offline });
      } else {
        emit({ status: "error", error: detail?.code ?? "voice_failed", ...offline });
        scheduleRetry();
      }
    });
    return failing;
  }

  const api = {
    async connect() {
      if (destroyed || joining || call) return joining;
      joining = (async () => {
        emit({ status: "connecting", error: null });
        let access;
        try {
          access = await fetchAccess();
        } catch (error) {
          if (error?.code === "voice_unavailable") {
            emit({ status: "unavailable", error: "voice_unavailable" });
            return;
          }
          emit({ status: "error", error: error?.code ?? "voice_failed" });
          scheduleRetry();
          return;
        }
        if (destroyed) return;
        try {
          const { default: Daily } = await loadDaily();
          if (destroyed) return;
          // Audio only, and no device access at join: the microphone is
          // requested the first time the user turns it on.
          call = Daily.createCallObject({ audioSource: false, videoSource: false, subscribeToTracksAutomatically: true });
          on("joined-meeting", () => {
            retryCount = 0;
            emit({ status: "connected" });
            refreshPartner();
            call.startRemoteParticipantsAudioLevelObserver(AUDIO_LEVEL_INTERVAL_MS).catch(() => {});
          });
          on("participant-joined", refreshPartner);
          on("participant-updated", refreshPartner);
          on("participant-left", refreshPartner);
          on("track-started", refreshPartner);
          on("track-stopped", refreshPartner);
          on("remote-participants-audio-level", ({ participantsAudioLevel }) => {
            const level = partnerSessionId ? (participantsAudioLevel?.[partnerSessionId] ?? 0) : 0;
            const now = performance.now();
            if (level > SPEAKING_THRESHOLD) speakingUntil = now + SPEAKING_HOLD_MS;
            const next = now < speakingUntil;
            if (next !== speaking) {
              speaking = next;
              emit({ partner: partnerState() });
            }
          });
          on("network-connection", ({ event }) => {
            if (event === "interrupted") emit({ status: "reconnecting" });
            else if (event === "connected") emit({ status: "connected" });
          });
          on("nonfatal-error", (event) => debugVoice("nonfatal", event));
          on("left-meeting", () => {
            if (destroyed) return;
            emit({ status: "disconnected", micEnabled: false, partner: { connected: false, muted: true, speaking: false } });
          });
          on("error", (event) => {
            debugVoice("fatal error", event);
            // Fatal for this call object: tear down, then retry with a fresh
            // token — unless retrying can't help (e.g. the Daily account itself).
            failed(event);
          });
          await call.join({ url: access.url, token: access.token, startAudioOff: true, startVideoOff: true });
        } catch (error) {
          debugVoice("join failed", error);
          failed(error);
        }
      })().finally(() => {
        joining = null;
      });
      return joining;
    },

    async setMic(enabled) {
      if (!call || destroyed) return;
      if (!enabled) {
        emit({ micPending: false, micEnabled: false });
        try {
          call.setLocalAudio(false);
          await call.setInputDevicesAsync({ audioSource: false });
        } catch {
          // the track is released below regardless
        }
        stopMicTrack(); // the browser's mic indicator goes off
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        emit({ micUnsupported: true, micEnabled: false });
        return;
      }
      emit({ micPending: true, permissionDenied: false, error: null });
      try {
        micTrack = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })).getAudioTracks()[0];
        if (!call || destroyed) {
          stopMicTrack();
          return;
        }
        await call.setInputDevicesAsync({ audioSource: micTrack });
        call.setLocalAudio(true);
        emit({ micPending: false, micEnabled: true });
      } catch (error) {
        stopMicTrack();
        const kind = micErrorKind(error);
        emit({ micPending: false, micEnabled: false, permissionDenied: kind === "permission", error: kind === "permission" ? null : `mic_${kind}` });
      }
    },

    unlockAudio() {
      audioEl?.play().then(
        () => emit({ audioBlocked: false }),
        () => {},
      );
    },

    /** Called when the browser comes back online after a failure. */
    retryNow() {
      if (destroyed || call || joining) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      retryCount = 0;
      api.connect();
    },

    async destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(retryTimer);
      retryTimer = null;
      await joining?.catch(() => {});
      await teardownCall();
    },
  };
  return api;
}
