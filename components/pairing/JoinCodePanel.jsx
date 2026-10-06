"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { INVITE_CODE_LENGTH, isValidInviteCode } from "@/lib/couple/code";
import { isRetryablePairingError, pairingErrorMessage } from "@/lib/couple/errors";
import { useCoupleStore } from "@/store/coupleStore";
import { CodeInput } from "./CodeInput";

/**
 * Enter a partner's invite code. On failure the typed code is kept and the
 * message explains what happened; temporary failures offer "Try again".
 */
export function JoinCodePanel() {
  const join = useCoupleStore((state) => state.join);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const errorId = useId();

  const complete = isValidInviteCode(code);
  const retryable = error && isRetryablePairingError(error);

  async function submit() {
    if (!complete || pending) return;
    setPending(true);
    setError(null);
    const result = await join(code);
    // On success the store flips to "paired" and the app moves on.
    if (!result.ok) {
      setError(result.code);
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col items-center gap-5 text-center short:gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="micro-caps text-text-muted">Enter their invite code</p>

      <CodeInput
        value={code}
        onChange={(next) => {
          setCode(next);
          if (error && !retryable) setError(null);
        }}
        onSubmit={submit}
        invalid={Boolean(error) && !retryable}
        disabled={pending}
        describedBy={error ? errorId : undefined}
        autoFocus
      />

      <p
        id={errorId}
        role={error ? "alert" : undefined}
        className={`min-h-5 text-caption ${!error ? "text-text-muted" : retryable ? "text-text-secondary" : "text-red-500"}`}
      >
        {error ? pairingErrorMessage(error) : `${INVITE_CODE_LENGTH} letters and numbers, from your partner's screen.`}
      </p>

      <Button type="submit" size="lg" className="min-w-44" disabled={!complete} pending={pending} pendingLabel="Joining…">
        {retryable ? "Try again" : "Join"}
      </Button>
    </form>
  );
}
