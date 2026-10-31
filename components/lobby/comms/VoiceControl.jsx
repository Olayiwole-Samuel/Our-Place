"use client";

import { LoaderCircle, Mic, MicOff, RotateCw, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { useVoiceStore } from "@/store/voiceStore";
import { HudButton } from "./HudButton";

/**
 * The mic control: one button whose icon, label and caption always say the real
 * state of the Daily connection. Mic is OFF until the user turns it on.
 *
 * The little speaker on its corner sets how loud your partner is on THIS
 * device (100–400 %): handy when they talk softly.
 */
export function VoiceControl() {
  const status = useVoiceStore((state) => state.status);
  const micEnabled = useVoiceStore((state) => state.micEnabled);
  const micPending = useVoiceStore((state) => state.micPending);
  const permissionDenied = useVoiceStore((state) => state.permissionDenied);
  const micUnsupported = useVoiceStore((state) => state.micUnsupported);
  const audioBlocked = useVoiceStore((state) => state.audioBlocked);
  const error = useVoiceStore((state) => state.error);
  const view = describeVoice({ status, micEnabled, micPending, permissionDenied, micUnsupported, audioBlocked, error });
  const partnerConnected = useVoiceStore((state) => state.partner.connected);
  const partnerVolume = useVoiceStore((state) => state.partnerVolume);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!volumeOpen) return undefined;
    const away = (event) => !rootRef.current?.contains(event.target) && setVolumeOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [volumeOpen]);

  // Subtle connect/disconnect cues (optional sounds).
  const wasConnected = useRef(false);
  useEffect(() => {
    const connected = status === "connected";
    if (connected !== wasConnected.current) {
      if (wasConnected.current || connected) playSound(connected ? "voiceOn" : "voiceOff");
      wasConnected.current = connected;
    }
  }, [status]);

  const onClick = () => {
    const store = useVoiceStore.getState();
    if (view.action === "unlock") store.unlockAudio();
    else if (view.action === "retry") store.retry();
    else if (view.action === "toggle") store.toggleMic();
  };

  return (
    <div ref={rootRef} className="relative flex flex-col items-center">
      <HudButton
        label={view.label}
        pressed={view.action === "toggle" ? micEnabled : undefined}
        disabled={!view.action}
        tone={micEnabled ? "live" : view.warn ? "warn" : "default"}
        onClick={onClick}
      >
        <view.Icon aria-hidden="true" size={19} strokeWidth={1.75} className={view.spin ? "animate-spin motion-reduce:animate-none" : undefined} />
      </HudButton>
      {status === "connected" && (partnerConnected || partnerVolume > 100) && (
        <button
          type="button"
          aria-label={`Your partner's volume: ${partnerVolume}%`}
          title="Your partner's volume"
          aria-expanded={volumeOpen}
          onClick={() => setVolumeOpen((open) => !open)}
          className={`absolute -top-2 -left-2 z-10 grid size-6 place-items-center rounded-full border border-[var(--border-subtle)] text-[0.6rem] font-bold shadow ${partnerVolume > 100 ? "bg-green-500 text-black-950" : "bg-black-800 text-text-secondary"}`}
        >
          {partnerVolume > 100 ? `${(partnerVolume / 100).toFixed(partnerVolume % 100 ? 1 : 0)}×` : <Volume2 aria-hidden="true" size={12} />}
        </button>
      )}
      {volumeOpen && (
        <div className="panel absolute right-0 bottom-full z-20 mb-2 flex w-56 flex-col gap-2 rounded-[var(--radius-md)] p-3 shadow-lg">
          <label htmlFor="partner-volume" className="flex items-baseline justify-between text-caption font-semibold text-white-soft">
            Their volume <span className="text-micro font-normal tracking-normal text-text-secondary">{partnerVolume}%</span>
          </label>
          <input
            id="partner-volume"
            type="range"
            min={100}
            max={400}
            step={25}
            value={partnerVolume}
            onChange={(event) => useVoiceStore.getState().setPartnerVolume(Number(event.target.value))}
            className="accent-green-500"
          />
          <p className="text-[0.65rem] leading-snug text-text-muted">Only on this phone. Above 250% loud moments can crackle a little.</p>
          {partnerVolume > 100 && (
            <button type="button" onClick={() => useVoiceStore.getState().setPartnerVolume(100)} className="self-start text-micro tracking-normal text-text-secondary underline-offset-2 hover:underline">
              Back to normal
            </button>
          )}
        </div>
      )}
      {view.caption && (
        <span role="status" className="voice-caption pointer-events-none absolute right-0 bottom-full mb-2 w-max max-w-[15rem] rounded-[var(--radius-sm)] bg-black-950/85 px-2 py-1 text-right text-micro tracking-normal text-text-secondary">
          {view.caption}
        </span>
      )}
    </div>
  );
}

export function describeVoice({ status, micEnabled, micPending, permissionDenied, micUnsupported, audioBlocked, error }) {
  if (status === "unavailable")
    return error === "voice_unsupported"
      ? { Icon: MicOff, label: "Voice isn't supported in this browser", caption: null, action: null }
      : error === "voice_account"
      ? { Icon: MicOff, label: "Voice is unavailable: the voice account needs attention", caption: null, action: null }
      : { Icon: MicOff, label: "Voice isn't set up yet", caption: null, action: null };
  if (status === "idle" || status === "connecting") return { Icon: LoaderCircle, spin: true, label: "Connecting voice…", caption: "Connecting voice…", action: null };
  if (status === "reconnecting") return { Icon: LoaderCircle, spin: true, label: "Voice reconnecting…", caption: "Reconnecting…", action: null };
  if (status === "error" || status === "disconnected")
    return { Icon: RotateCw, warn: true, label: "Voice disconnected. Reconnect voice", caption: "Voice disconnected — tap to retry", action: "retry" };
  if (error === "voice_elsewhere")
    return { Icon: RotateCw, warn: true, label: "Voice is on in your other tab or device. Use voice here", caption: "Voice is on in your other tab or device — tap to use it here", action: "retry" };
  if (error === "voice_unreachable")
    return { Icon: RotateCw, warn: true, label: "Couldn't connect voice on this network. Try again", caption: "Couldn't connect voice on this network — tap to retry", action: "retry" };
  if (audioBlocked) return { Icon: Volume2, warn: true, label: "Tap to hear your partner", caption: "Tap to hear your partner", action: "unlock" };
  if (micUnsupported) return { Icon: MicOff, label: "Microphone not supported in this browser", caption: "This browser can't use a microphone here", action: null };
  if (micPending) return { Icon: LoaderCircle, spin: true, label: "Waiting for microphone permission", caption: "Allow the microphone to talk", action: null };
  if (permissionDenied)
    return {
      Icon: MicOff,
      warn: true,
      label: "Microphone access is off. Try again",
      caption: "Microphone access is off. Enable it in your browser settings to talk with your partner.",
      action: "toggle",
    };
  if (error === "mic_no_device") return { Icon: MicOff, warn: true, label: "No microphone found. Try again", caption: "No microphone found", action: "toggle" };
  if (error === "mic_busy") return { Icon: MicOff, warn: true, label: "Microphone is busy. Try again", caption: "Your microphone is in use by another app", action: "toggle" };
  if (micEnabled) return { Icon: Mic, label: "Disable microphone", caption: null, action: "toggle" };
  return { Icon: MicOff, label: "Enable microphone", caption: null, action: "toggle" };
}
