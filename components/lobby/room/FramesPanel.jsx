"use client";

import { Check, Images, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { FRAME_WALLS, framePhotos, slotIds } from "@/lib/room/frames";
import { useRoomStore } from "@/store/roomStore";
import { RoomPanel } from "./RoomPanel";

/**
 * Choosing the photos on a wall of picture frames (couple_frames): tap a frame,
 * then the photo to hang in it. "Newest" puts a frame back to showing your
 * newest photos by itself. Photos come from your memories (add more there).
 */
export function FramesPanel() {
  const wallId = useRoomStore((state) => state.panelTarget) ?? Object.keys(FRAME_WALLS)[0];
  const frames = useRoomStore((state) => state.frames);
  const memories = useRoomStore((state) => state.memories);
  const photos = useMemo(() => framePhotos(frames, memories), [frames, memories]);
  const slots = slotIds(wallId);
  const [selected, setSelected] = useState(slots[0]);
  const [error, setError] = useState(null);
  const usable = memories.filter((memory) => memory.url);

  const hang = async (memoryId) => {
    const code = await useRoomStore.getState().setFrame(selected, memoryId);
    setError(code ? (code === "unavailable" ? "Picture frames need one database update first." : "Couldn't hang that — try again.") : null);
    // Move on to the next frame, like hanging pictures one after another.
    if (!code && memoryId) setSelected(slots[(slots.indexOf(selected) + 1) % slots.length]);
  };

  return (
    <RoomPanel title={`Pictures · ${FRAME_WALLS[wallId]?.name ?? "Frames"}`} icon={<Images size={16} />} wide>
      <div className="flex flex-col gap-3 p-3 short:gap-2 short:p-2">
        <section aria-label="Frames on this wall" className="flex gap-2">
          {slots.map((slot, i) => {
            const photo = photos[slot];
            const active = slot === selected;
            return (
              <button
                key={slot}
                type="button"
                aria-pressed={active}
                aria-label={`Frame ${i + 1}${photo?.chosen ? "" : ", showing your newest photos"}`}
                onClick={() => setSelected(slot)}
                className={`relative flex aspect-[4/5] w-24 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border-4 bg-black-950 short:w-16 ${active ? "border-pink-400" : "border-[#1b1b1b]"}`}
              >
                {photo?.memory ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                  <img src={photo.memory.url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="px-1 text-micro tracking-normal text-text-muted">Empty</span>
                )}
                {!photo?.chosen && photo?.memory && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[0.6rem] text-white-soft">Newest</span>}
              </button>
            );
          })}
          <p className="flex-1 self-center text-caption text-text-secondary">
            Tap a frame, then the photo to hang in it.
            {photos[selected]?.chosen && (
              <button type="button" onClick={() => hang(null)} className="mt-1 flex items-center gap-1 text-micro tracking-normal text-pink-400 hover:underline">
                <RotateCcw aria-hidden="true" size={11} /> Back to newest photos
              </button>
            )}
          </p>
        </section>
        {error && <p className="text-micro tracking-normal text-pink-400">{error}</p>}
        {usable.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-caption text-text-secondary">No photos yet — add your pictures to Memories first.</p>
            <button type="button" onClick={() => useRoomStore.getState().openPanel("memories")} className="min-h-10 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white">
              Add photos
            </button>
          </div>
        ) : (
          <ul aria-label="Your photos" className="grid max-h-[16rem] grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain sm:grid-cols-6 short:max-h-[8.5rem] short:grid-cols-8">
            {usable.map((memory) => {
              const here = frames[selected] === memory.id;
              return (
                <li key={memory.id}>
                  <button type="button" onClick={() => hang(memory.id)} aria-label={`Hang ${memory.caption || "this photo"} here`} className={`relative block aspect-square w-full overflow-hidden rounded-[var(--radius-sm)] ${here ? "ring-2 ring-pink-400" : "hover:brightness-110"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs */}
                    <img src={memory.url} alt="" className="size-full object-cover" loading="lazy" />
                    {here && (
                      <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-pink-500 text-black-950">
                        <Check aria-hidden="true" size={12} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </RoomPanel>
  );
}
