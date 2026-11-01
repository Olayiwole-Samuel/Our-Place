"use client";

import { useEffect, useRef, useState } from "react";
import { goodnightTonight, sleepSoundNow } from "@/lib/bedroom/night";
import { SLEEP_SOUNDS, createSleepSound } from "@/lib/bedroom/sounds";
import { toast } from "@/store/toastStore";
import { useBedroomStore } from "@/store/bedroomStore";
import { useRoomStore } from "@/store/roomStore";

/**
 * The bedroom on the HUD:
 *   • the sleep sound player — plays the shared sound on this phone (wherever
 *     you are in the house) until the sleep timer runs out; a chip shows it,
 *     and asks for a tap when the phone hasn't allowed sound yet
 *   • while you lie on the bed: Goodnight · Sleep sounds · The sky
 *   • "💤 <partner> said goodnight" when they do
 */
export function BedroomHud({ me, partner, partnerName }) {
  return (
    <>
      <SleepSoundPlayer />
      <GoodnightNotice me={me} partner={partner} partnerName={partnerName} />
    </>
  );
}

/** Buttons while you're lying in bed (shown in the HUD's centre). */
export function BedActions() {
  const lying = useBedroomStore((state) => state.lying);
  if (!lying) return null;
  const open = (tab) => {
    useBedroomStore.getState().setTab(tab);
    useRoomStore.getState().openPanel("bedroom");
  };
  return (
    <div className="panel pointer-events-auto flex flex-col items-center gap-2 rounded-[var(--radius-lg)] px-3 py-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {[
          ["goodnight", "🌙 Goodnight"],
          ["sounds", "🌧️ Sleep sounds"],
          ["sky", "🌠 The sky"],
        ].map(([tab, label]) => (
          <button key={tab} type="button" onClick={() => open(tab)} className="min-h-9 rounded-full bg-[#5b4bb7]/70 px-3 text-micro font-semibold tracking-normal text-white hover:bg-[#5b4bb7]">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SleepSoundPlayer() {
  const sleep = useBedroomStore((state) => state.sleep);
  const volume = useBedroomStore((state) => state.soundVolume);
  const [, setTick] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const player = useRef(null);
  const now = sleepSoundNow(sleep);
  const kind = now.on ? sleep.sound : null;
  const key = now.on ? `${sleep.sound}|${sleep.startedAt}` : null;

  // Start / switch / stop the sound.
  useEffect(() => {
    if (!kind) return undefined;
    const sound = createSleepSound(kind);
    if (!sound) return undefined;
    player.current = sound;
    sound.setVolume(useBedroomStore.getState().soundVolume);
    sound.start().then((running) => setBlocked(!running));
    return () => {
      sound.stop(2.5);
      if (player.current === sound) player.current = null;
      setBlocked(false);
    };
    // `key` changes when a new sound (or a restart) is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => player.current?.setVolume(volume), [volume]);

  // The sleep timer: re-check when it should end.
  useEffect(() => {
    if (!now.on || !Number.isFinite(now.left)) return undefined;
    const timer = setTimeout(() => setTick((n) => n + 1), now.left + 200);
    return () => clearTimeout(timer);
  }, [now.on, now.left]);

  if (!kind) return null;
  const info = SLEEP_SOUNDS.find((s) => s.id === kind);
  const unlock = async () => setBlocked(!(await player.current?.start()));
  return (
    <div className="sleep-chip pointer-events-auto">
      {blocked ? (
        <button type="button" onClick={unlock} className="panel music-unlock flex items-center gap-1.5 rounded-full px-3 py-1.5 text-micro font-semibold tracking-normal text-white-soft">
          {info?.emoji} Tap to hear the {info?.label.toLowerCase()}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            useBedroomStore.getState().setTab("sounds");
            useRoomStore.getState().openPanel("bedroom");
          }}
          className="panel flex items-center gap-1.5 rounded-full px-3 py-1.5 text-micro tracking-normal text-[#c7bfff]"
          aria-label={`Sleep sound: ${info?.label}. Open sleep sounds`}
        >
          {info?.emoji} {info?.label}
          {Number.isFinite(now.left) && <span className="text-text-muted">· {Math.max(1, Math.round(now.left / 60_000))} min</span>}
        </button>
      )}
    </div>
  );
}

/** "💤 <partner> said goodnight" — once, when it happens. */
function GoodnightNotice({ me, partner, partnerName }) {
  const goodnights = useBedroomStore((state) => state.goodnights);
  const seen = useRef(null);
  useEffect(() => {
    const { theirs, mine } = goodnightTonight(goodnights, { me, partner });
    const key = theirs ? `${theirs.night}|${theirs.saidAt}|${theirs.note ?? ""}` : null;
    if (seen.current === null) {
      seen.current = key ?? ""; // what was already there when the room opened isn't news
      return;
    }
    if (!key || key === seen.current) return;
    seen.current = key;
    toast(`💤 ${partnerName} said goodnight${mine ? " back" : ""}${theirs.note ? `: “${theirs.note}”` : ""}`);
  }, [goodnights, me, partner, partnerName]);
  return null;
}
