"use client";

import { ChevronLeft, ChevronRight, Images, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { memoryApi, memoryImageFromFile } from "@/lib/room/memories";
import { useRoomStore } from "@/store/roomStore";
import { RoomPanel, ago } from "./RoomPanel";

/**
 * The memory wall: photos you hang together. The newest five are framed on the
 * wall in the room. Photos are private to the two of you (private bucket,
 * short-lived links); either of you can add, caption or take one down.
 */
export function MemoriesPanel({ me, partnerName }) {
  const memories = useRoomStore((state) => state.memories);
  const [adding, setAdding] = useState(null); // { image, caption, takenOn }
  const [viewing, setViewing] = useState(null); // index
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const pick = async (file) => {
    setError(null);
    try {
      setAdding({ image: await memoryImageFromFile(file), caption: "", takenOn: "" });
    } catch (problem) {
      setError(problem.message === "too_big" ? "That photo is too large even after resizing." : "That file isn't a photo we can use.");
    }
  };
  const save = async () => {
    setBusy(true);
    const result = await memoryApi.add(adding.image, adding.caption, adding.takenOn);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAdding(null);
    await useRoomStore.getState().refresh("memories");
  };

  return (
    <RoomPanel
      title={`Memories · ${memories.length}`}
      icon={<Images size={16} />}
      wide
      actions={
        <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-green-600 px-3 text-caption font-semibold text-white">
          <ImagePlus aria-hidden="true" size={15} /> Add photo
        </button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) pick(file);
        }}
      />
      <div className="p-3 short:p-2">
        {error && (
          <p role="alert" className="mb-2 text-caption text-pink-400">
            {error}
          </p>
        )}
        {memories.length === 0 && !adding && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-body text-white-soft">Your wall is empty.</p>
            <p className="text-caption text-text-secondary">Add a photo of the two of you — it&apos;ll hang in your room for both of you.</p>
          </div>
        )}
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 short:grid-cols-6">
          {memories.map((memory, index) => (
            <li key={memory.id}>
              <button type="button" onClick={() => setViewing(index)} className="group relative block aspect-square w-full overflow-hidden rounded-[var(--radius-sm)] bg-black-800">
                {memory.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                  <img src={memory.url} alt={memory.caption || "A memory"} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
                )}
                {memory.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black-950/90 to-transparent px-1.5 pt-4 pb-1 text-left text-micro tracking-normal text-white-soft">{memory.caption}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {adding && (
        <div role="dialog" aria-label="New memory" className="fixed inset-0 z-50 grid place-items-center bg-black-950/70 p-3">
          <div className="panel flex max-h-full w-[min(40rem,100%)] flex-col gap-2 overflow-y-auto rounded-[var(--radius-lg)] p-3 short:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={adding.image} alt="" className="max-h-[45dvh] rounded-[var(--radius-sm)] object-contain short:max-h-[70dvh] short:max-w-[50%]" />
            <div className="flex flex-1 flex-col gap-2">
              <label className="text-micro tracking-normal text-text-muted" htmlFor="memory-caption">
                Caption
              </label>
              <input id="memory-caption" maxLength={200} value={adding.caption} onChange={(event) => setAdding({ ...adding, caption: event.target.value })} placeholder="Our first trip to Lekki" className="min-h-10 rounded-[var(--radius-sm)] bg-black-950/60 px-2 text-body text-white-soft outline-none focus:ring-1 focus:ring-green-500" />
              <label className="text-micro tracking-normal text-text-muted" htmlFor="memory-date">
                When was it? (optional)
              </label>
              <input id="memory-date" type="date" value={adding.takenOn} onChange={(event) => setAdding({ ...adding, takenOn: event.target.value })} className="min-h-10 rounded-[var(--radius-sm)] bg-black-950/60 px-2 text-body text-white-soft [color-scheme:dark]" />
              <div className="mt-auto flex gap-2">
                <button type="button" disabled={busy} onClick={save} className="min-h-10 flex-1 rounded-[var(--radius-md)] bg-green-600 text-body font-semibold text-white">
                  {busy ? "Hanging it…" : "Hang it on the wall"}
                </button>
                <button type="button" onClick={() => setAdding(null)} className="min-h-10 rounded-[var(--radius-md)] px-3 text-body text-text-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewing !== null && memories[viewing] && <Viewer memories={memories} index={viewing} onIndex={setViewing} me={me} partnerName={partnerName} />}
    </RoomPanel>
  );
}

function Viewer({ memories, index, onIndex, me, partnerName }) {
  const memory = memories[index];
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(memory.caption);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setEditing(false);
    setCaption(memory.caption);
    setConfirmDelete(false);
  }, [memory.id, memory.caption]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      else if (event.key === "ArrowRight") onIndex(Math.min(memories.length - 1, index + 1));
      else if (event.key === "Escape") {
        event.preventDefault();
        onIndex(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [index, memories.length, onIndex]);

  const close = () => onIndex(null);
  return (
    <div role="dialog" aria-label="Memory" className="fixed inset-0 z-50 flex flex-col bg-black-950/95 p-2 safe-inset">
      <div className="flex items-center gap-2 px-1 pb-2">
        <p className="min-w-0 flex-1 truncate text-caption text-text-secondary">
          {memory.uploaderId === me ? "You" : partnerName} · {memory.takenOn ? new Date(memory.takenOn).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : ago(memory.createdAt)}
        </p>
        <button type="button" aria-label="Edit caption" onClick={() => setEditing((e) => !e)} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-secondary hover:bg-black-800">
          <Pencil aria-hidden="true" size={15} />
        </button>
        {confirmDelete ? (
          <button
            type="button"
            onClick={async () => {
              await memoryApi.remove(memory.id);
              close();
              useRoomStore.getState().refresh("memories");
            }}
            className="min-h-9 rounded-[var(--radius-md)] bg-pink-500 px-3 text-caption font-semibold text-black-950"
          >
            Take it down?
          </button>
        ) : (
          <button type="button" aria-label="Take down" onClick={() => setConfirmDelete(true)} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-secondary hover:bg-black-800">
            <Trash2 aria-hidden="true" size={15} />
          </button>
        )}
        <button type="button" aria-label="Close" onClick={close} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-secondary hover:bg-black-800">
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        {memory.url && <img src={memory.url} alt={memory.caption || "A memory"} className="max-h-full max-w-full rounded-[var(--radius-sm)] object-contain" />}
        {index > 0 && (
          <button type="button" aria-label="Previous" onClick={() => onIndex(index - 1)} className="absolute left-1 grid size-11 place-items-center rounded-full bg-black-900/70 text-white-soft">
            <ChevronLeft aria-hidden="true" size={22} />
          </button>
        )}
        {index < memories.length - 1 && (
          <button type="button" aria-label="Next" onClick={() => onIndex(index + 1)} className="absolute right-1 grid size-11 place-items-center rounded-full bg-black-900/70 text-white-soft">
            <ChevronRight aria-hidden="true" size={22} />
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="flex gap-2 pt-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await memoryApi.update(memory.id, caption, memory.takenOn);
            setEditing(false);
            useRoomStore.getState().refresh("memories");
          }}
        >
          <input value={caption} maxLength={200} onChange={(event) => setCaption(event.target.value)} className="min-h-10 flex-1 rounded-[var(--radius-sm)] bg-black-800 px-2 text-body text-white-soft outline-none" aria-label="Caption" />
          <button type="submit" className="min-h-10 rounded-[var(--radius-md)] bg-green-600 px-3 text-caption font-semibold text-white">
            Save
          </button>
        </form>
      ) : (
        memory.caption && <p className="pt-2 text-center text-body text-white-soft">{memory.caption}</p>
      )}
    </div>
  );
}
