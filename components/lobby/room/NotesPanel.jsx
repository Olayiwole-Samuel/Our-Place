"use client";

import { StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import { RoomPanel, ago } from "./RoomPanel";

/**
 * The message board: notes you leave each other to find later. Notes are
 * written through add_note() (the database checks length, couple and rate),
 * only the author can take one down, and opening the board marks your
 * partner's notes as seen.
 */
const COLORS = {
  yellow: "bg-[#f6e27a] text-[#3a3214]",
  pink: "bg-[#f3a6b9] text-[#45131f]",
  green: "bg-[#b6dd9a] text-[#1d3311]",
  blue: "bg-[#a9d4f5] text-[#11283d]",
};
const ERRORS = { empty: "Write something first.", too_long: "Notes can be up to 500 characters.", rate_limited: "That's a lot of notes — wait a moment.", invalid: "Pick a colour." };

export function NotesPanel({ me, partnerName }) {
  const notes = useRoomStore((state) => state.notes);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState("yellow");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pin = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const code = await useRoomStore.getState().addNote(draft, color);
    setBusy(false);
    if (code) setError(ERRORS[code] ?? "Couldn't pin that note. Try again.");
    else {
      setDraft("");
      setError(null);
    }
  };

  return (
    <RoomPanel title="Notes" icon={<StickyNote size={16} />}>
      <div className="flex flex-col gap-3 p-3 short:flex-row short:items-start short:gap-2 short:p-2">
        <form
          className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-black-800/70 p-2 short:w-[15rem] short:shrink-0"
          onSubmit={(event) => {
            event.preventDefault();
            pin();
          }}
        >
          <label htmlFor="note-draft" className="text-micro tracking-normal text-text-muted">
            Leave {partnerName} a note
          </label>
          <textarea
            id="note-draft"
            value={draft}
            maxLength={520}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Good morning, sunshine ☀️"
            className={`resize-none rounded-[var(--radius-sm)] p-2 text-body leading-snug outline-none placeholder:opacity-60 short:text-caption ${COLORS[color]}`}
          />
          <div className="flex items-center gap-1.5">
            {Object.keys(COLORS).map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} note`}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
                className={`size-7 rounded-full ${COLORS[value]} ${color === value ? "ring-2 ring-white-soft" : ""}`}
              />
            ))}
            <span className="flex-1 text-right text-micro tracking-normal text-text-muted">{500 - [...draft].length}</span>
            <button type="submit" disabled={!draft.trim() || busy} className="min-h-9 rounded-[var(--radius-sm)] bg-green-600 px-3 text-caption font-semibold text-white disabled:opacity-40">
              Pin it
            </button>
          </div>
          {error && (
            <p role="alert" className="text-micro tracking-normal text-pink-400">
              {error}
            </p>
          )}
        </form>

        <ul className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 short:grid-cols-2" aria-label="Notes on the board">
          {notes.length === 0 && <li className="col-span-full py-6 text-center text-caption text-text-muted">No notes yet. Pin the first one ❤️</li>}
          {notes.map((note) => {
            const mine = note.authorId === me;
            const fresh = !mine && !note.seenAt;
            return (
              <li key={note.id} className={`relative rounded-[var(--radius-sm)] p-2.5 shadow-[0_3px_10px_rgba(0,0,0,0.35)] ${COLORS[note.color] ?? COLORS.yellow}`}>
                <p className="text-body leading-snug break-words whitespace-pre-wrap short:text-caption">{note.body}</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-micro tracking-normal opacity-70">
                  <span className="font-semibold">{mine ? "You" : partnerName}</span>· {ago(note.createdAt)}
                  {fresh && <span className="rounded-full bg-black-950/80 px-1.5 text-[0.65rem] font-semibold text-pink-400 opacity-100">new</span>}
                  {mine && note.seenAt && <span>· seen</span>}
                </p>
                {mine && (
                  <button type="button" aria-label="Take this note down" onClick={() => useRoomStore.getState().deleteNote(note.id)} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full opacity-50 hover:bg-black/10 hover:opacity-100">
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </RoomPanel>
  );
}
