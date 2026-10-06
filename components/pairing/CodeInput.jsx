"use client";

import { useId, useState } from "react";
import { INVITE_CODE_LENGTH, sanitizeInviteCode } from "@/lib/couple/code";

/**
 * Six-character invite-code entry.
 *
 * One real <input> sits over six visual cells, so typing, deleting, pasting
 * ("a7k-9q2"), mobile keyboards and screen readers all behave natively. Input is
 * uppercased and filtered to the code alphabet as it arrives; characters that can
 * never appear in a code (0, O, 1, I, L) are dropped with a hint.
 */
export function CodeInput({ value, onChange, onSubmit, invalid = false, disabled = false, describedBy, autoFocus }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [focused, setFocused] = useState(false);
  const [droppedHint, setDroppedHint] = useState(false);

  function handleChange(event) {
    const { code, dropped } = sanitizeInviteCode(event.target.value);
    setDroppedHint(dropped);
    onChange(code);
  }

  const activeIndex = Math.min(value.length, INVITE_CODE_LENGTH - 1);
  const ring = invalid ? "border-red-500" : "border-green-500";

  return (
    <div className="flex flex-col items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Invite code, {INVITE_CODE_LENGTH} characters
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={handleChange}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit?.();
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, droppedHint ? hintId : null].filter(Boolean).join(" ") || undefined}
          // 16px keeps iOS from zooming on focus; the field itself is invisible.
          className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-[16px] text-transparent caret-transparent opacity-0 outline-none disabled:cursor-not-allowed"
        />
        <div aria-hidden="true" className="flex gap-2 short:gap-1.5">
          {Array.from({ length: INVITE_CODE_LENGTH }, (_, i) => {
            const char = value[i];
            const isActive = focused && !disabled && i === activeIndex && value.length < INVITE_CODE_LENGTH;
            const isComplete = focused && value.length === INVITE_CODE_LENGTH;
            return (
              <span
                key={i}
                className={`grid h-14 w-11 place-items-center rounded-[var(--radius-sm)] border bg-black-950 font-mono text-code text-white-soft transition-colors short:h-12 short:w-10 sm:w-12 ${
                  invalid ? "border-red-500/70" : isActive || isComplete ? ring : char ? "border-[var(--border-strong)]" : "border-[var(--border-subtle)]"
                } ${disabled ? "opacity-60" : ""}`}
              >
                {char ?? (isActive ? <span className="h-6 w-0.5 animate-pulse-live bg-green-500" /> : "")}
              </span>
            );
          })}
        </div>
      </div>
      {droppedHint && (
        <p id={hintId} className="text-caption text-text-muted">
          Codes never use 0, O, 1, I or L.
        </p>
      )}
    </div>
  );
}
