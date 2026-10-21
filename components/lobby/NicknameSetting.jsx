"use client";

import { Check, Heart, Pencil, X } from "lucide-react";
import { useRef, useState } from "react";
import { useCoupleStore, useCoupleStoreApi } from "@/store/coupleStore";

const MAX = 30;

/**
 * "Your name for them": a nickname for your partner that replaces their
 * account name everywhere on YOUR screens — the room, chat, games, the "Us"
 * page, the label over their character and your phone notifications. Only
 * you see it. Saved on the server (couple_members.partner_nickname), so it
 * follows you to every device.
 */
export function NicknameSetting() {
  const partner = useCoupleStore((state) => state.partner);
  const store = useCoupleStoreApi();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  if (!partner) return null;
  const account = partner.accountName ?? partner.displayName ?? "";
  const accountFirst = account.trim().split(/\s+/)[0] || "your partner";

  const save = async (next) => {
    setSaving(true);
    setError(null);
    const result = await store.getState().setNickname(next);
    setSaving(false);
    if (result.ok) setEditing(false);
    else setError(result.code === "invalid_request" ? `Up to ${MAX} characters.` : "Couldn't save that name. Try again.");
  };

  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] px-3 py-2 hover:bg-black-800">
      {editing ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            save(value.trim());
          }}
        >
          <label htmlFor="partner-nickname" className="flex items-center gap-2 text-body text-white-soft">
            <Heart aria-hidden="true" size={15} className="text-pink-400" /> Your name for {accountFirst}
          </label>
          <div className="flex items-center gap-1">
            <input
              id="partner-nickname"
              ref={inputRef}
              value={value}
              maxLength={MAX}
              autoComplete="off"
              enterKeyHint="done"
              placeholder={accountFirst}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation(); // typing never walks the character or triggers shortcuts
                if (event.key === "Escape") setEditing(false);
              }}
              className="min-h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] bg-black-950 px-2 text-body text-white-soft outline-none ring-1 ring-[var(--border-strong)] focus:ring-pink-400"
            />
            <button type="submit" disabled={saving} aria-label="Save name" className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-green-600 text-white disabled:opacity-50">
              <Check aria-hidden="true" size={15} />
            </button>
            <button type="button" aria-label="Cancel" onClick={() => setEditing(false)} className="grid size-9 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:text-white-soft">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
          <span className="flex items-center justify-between gap-2 text-micro tracking-normal text-text-muted">
            <span>
              {value.length}/{MAX} · only you see it
            </span>
            {partner.nickname && (
              <button type="button" disabled={saving} onClick={() => save("")} className="text-pink-400 underline-offset-2 hover:underline">
                Use “{accountFirst}” again
              </button>
            )}
          </span>
          {error && (
            <span role="alert" className="text-micro tracking-normal text-pink-400">
              {error}
            </span>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setValue(partner.nickname ?? "");
            setError(null);
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="flex items-center justify-between gap-2 text-left text-body text-white-soft"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Heart aria-hidden="true" size={15} className="shrink-0 text-pink-400" />
            <span className="truncate">{partner.nickname ? `Calling them “${partner.nickname}”` : `Name for ${accountFirst}`}</span>
          </span>
          <Pencil aria-hidden="true" size={13} className="shrink-0 text-text-muted" />
        </button>
      )}
    </div>
  );
}
