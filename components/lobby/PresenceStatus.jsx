"use client";

import { MicOff, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { useCoupleStore } from "@/store/coupleStore";
import { lastSeenText, useRoomStore } from "@/store/roomStore";
import { useVoiceStore } from "@/store/voiceStore";
import { useWorldStore } from "@/store/worldStore";

/**
 * Top-left: your partner and whether they're here. Status is always written
 * out in words (not colour alone) and only says "here" when Realtime presence
 * confirms it.
 */
export function PartnerStatus() {
  const partner = useCoupleStore((state) => state.partner);
  const status = useWorldStore((state) => state.partner.status);
  const connection = useWorldStore((state) => state.connection);
  const seenAt = useRoomStore((state) => state.partnerSeenAt);
  useMinuteTick(status === "offline");
  // When they leave, re-read "last here" so it says "just now", not an old visit.
  useEffect(() => {
    if (status === "offline") useRoomStore.getState().refresh("seen");
  }, [status]);
  if (!partner) return null;

  const name = partner.displayName?.split(" ")[0] || "Your person";
  const line =
    status === "online"
      ? { text: "Here with you", dot: "bg-pink-400" }
      : status === "away"
        ? { text: "Reconnecting…", dot: "bg-text-muted animate-pulse-live" }
        : status === "offline"
          ? { text: seenAt ? `Last here ${lastSeenText(seenAt)}` : "Not here yet", dot: "bg-text-muted/50" }
          : connection === "unavailable" || connection === "closed"
            ? { text: "Can't check right now", dot: "bg-text-muted/50" }
            : { text: "Checking…", dot: "bg-text-muted/50 animate-pulse-live" };

  return (
    <div role="status" aria-live="polite" className="panel pointer-events-auto flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] py-2 pr-4 pl-2 short:gap-2 short:py-1 short:pr-3 short:pl-1">
      <ProfileAvatar profile={partner} size={34} ring="pink" />
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5 text-caption font-semibold text-white-soft">
          <span className="truncate">{name}</span>
          <PartnerVoice />
        </span>
        <span className="flex items-center gap-1.5 text-caption whitespace-nowrap text-text-secondary">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${line.dot}`} />
          {line.text}
        </span>
      </div>
    </div>
  );
}

const CONNECTION = {
  live: { text: "Live", dot: "bg-blue-400" },
  connecting: { text: "Connecting…", dot: "bg-blue-400/50 animate-pulse-live" },
  reconnecting: { text: "Reconnecting…", dot: "bg-text-muted animate-pulse-live" },
  closed: { text: "Offline", dot: "bg-red-500" },
  unavailable: { text: "Offline", dot: "bg-red-500" },
};

/** Top-right: is this device connected to the couple's realtime channel? */
export function ConnectionStatus() {
  const connection = useWorldStore((state) => state.connection);
  const state = CONNECTION[connection] ?? CONNECTION.connecting;
  return (
    <div
      role="status"
      aria-label={`Connection: ${state.text}`}
      className="panel pointer-events-auto flex h-[var(--control-size)] items-center gap-2 rounded-[var(--radius-md)] px-3 text-caption text-text-secondary"
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${state.dot}`} />
      <span aria-hidden="true" className="hidden whitespace-nowrap sm:inline short:hidden">
        {state.text}
      </span>
    </div>
  );
}

/**
 * Partner's voice, from Daily (never simulated): nothing when they aren't in
 * voice, a muted mic when they're connected but muted, a speaker that lights up
 * sky blue while they're actually speaking.
 */
function PartnerVoice() {
  const { connected, muted, speaking } = useVoiceStore((state) => state.partner);
  if (!connected) return null;
  if (muted)
    return (
      <span title="In voice, muted" className="text-text-muted">
        <MicOff aria-hidden="true" size={13} strokeWidth={2} />
        <span className="sr-only">in voice, muted</span>
      </span>
    );
  return (
    <span title={speaking ? "Speaking" : "In voice"} className={`transition-colors duration-150 ${speaking ? "text-blue-400" : "text-text-muted"}`}>
      <Volume2 aria-hidden="true" size={14} strokeWidth={2} />
      <span className="sr-only">{speaking ? "speaking" : "in voice"}</span>
    </span>
  );
}

/** Re-renders once a minute while `active` (keeps "last here 5 min ago" honest). */
function useMinuteTick(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, [active]);
}
