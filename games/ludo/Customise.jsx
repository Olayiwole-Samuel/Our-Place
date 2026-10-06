"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { removeCouplePhoto, setCouplePhoto } from "@/lib/couple/photos";

/**
 * "Customise board": a small map of the board's four photo spots, laid out as
 * they appear on the board (your yard bottom-left, your partner's top-right,
 * the two together photos in the other corners). Tap a spot to choose its
 * picture; it's cropped and resized on the device, then saved for your couple.
 * Either of you can set any spot. Nothing here touches the game.
 */
export function Customise({ photos, mySeat, me, partner, partnerName, onClose }) {
  const together = (letter) => (letter === "a" ? photos?.togetherA : photos?.togetherB);
  const portrait = (id) => photos?.partners?.find((p) => p.userId === id)?.url ?? null;
  // Viewer frame: seat B sees the board turned, so the together corners swap.
  const [topLeft, bottomRight] = mySeat === 0 ? ["a", "b"] : ["b", "a"];
  const spots = [
    { key: "tl", label: "Together", slot: `together_${topLeft}`, url: together(topLeft) },
    { key: "tr", label: partnerName, slot: "portrait", whose: "partner", url: portrait(partner) },
    { key: "bl", label: "You", slot: "portrait", whose: "mine", url: portrait(me) },
    { key: "br", label: "Together", slot: `together_${bottomRight}`, url: together(bottomRight) },
  ];
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState("");

  const run = async (spot, task) => {
    setBusy(spot.key);
    setMessage("");
    const result = await task();
    setBusy(null);
    setMessage(result.ok ? "Saved ❤️" : result.message);
  };

  return (
    <section aria-label="Customise board" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-caption font-semibold text-white-soft">Customise board</h3>
        <button type="button" onClick={onClose} aria-label="Done customising" className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft">
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <p className="text-micro tracking-normal text-text-muted">Tap a spot to choose its picture.</p>
      <div className="grid grid-cols-2 gap-2">
        {spots.map((spot) => (
          <Spot key={spot.key} spot={spot} busy={busy === spot.key} disabled={Boolean(busy)} onPick={(file) => run(spot, () => setCouplePhoto(spot.slot, file, spot.whose))} onRemove={() => run(spot, () => removeCouplePhoto(spot.slot, spot.whose))} />
        ))}
      </div>
      <p role="status" aria-live="polite" className="min-h-4 text-micro tracking-normal text-text-secondary">
        {message}
      </p>
    </section>
  );
}

const POSITION = { tl: "top left", tr: "top right", bl: "bottom left", br: "bottom right" };

function Spot({ spot, busy, disabled, onPick, onRemove }) {
  const input = useRef(null);
  const [failed, setFailed] = useState(null);
  const show = spot.url && failed !== spot.url;
  return (
    <div className="flex flex-col gap-1" data-spot={spot.key}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label={`Choose ${spot.label === "You" ? "your photo" : spot.label === "Together" ? "a together photo" : `${spot.label}'s photo`} (${POSITION[spot.key]})`}
        className="relative grid aspect-square place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-black-800 text-text-muted transition-colors hover:border-[var(--border-strong)]"
      >
        {show ? (
          // eslint-disable-next-line @next/next/no-img-element -- small private preview
          <img src={spot.url} alt="" onError={() => setFailed(spot.url)} className="absolute inset-0 size-full object-cover" />
        ) : (
          <ImagePlus aria-hidden="true" size={18} />
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-black-950/80 px-1 py-0.5 text-center text-micro tracking-normal text-white-soft">{busy ? "Saving…" : spot.label}</span>
      </button>
      {spot.url && !busy && (
        <button type="button" disabled={disabled} onClick={onRemove} className="text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Remove
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}
