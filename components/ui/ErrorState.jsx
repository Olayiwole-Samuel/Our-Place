"use client";

import { Atmosphere } from "@/components/brand/Atmosphere";
import { presentError } from "@/lib/errors";
import { Button } from "./Button";

/**
 * Displays any error using its category's human copy (never the raw message),
 * with one recovery action when the caller can provide one.
 */
export function ErrorState({ error, onRetry, variant = "screen", diagnostics }) {
  const { title, message, recovery } = presentError(error);
  const action =
    recovery === "reload"
      ? { label: "Reload", run: () => window.location.reload() }
      : onRetry
        ? { label: "Try again", run: onRetry }
        : null;

  const body = (
    <div className="flex max-w-md flex-col items-center gap-3 text-center">
      <span aria-hidden="true" className="mb-1 size-2 rounded-full bg-red-500" />
      <h2 className="text-subheading text-white-soft">{title}</h2>
      <p className="text-body text-text-secondary">{message}</p>
      {diagnostics && process.env.NODE_ENV !== "production" && (
        <details className="mt-2 max-w-md text-left text-caption text-text-muted">
          <summary className="cursor-pointer">Developer details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all">{diagnostics}</pre>
        </details>
      )}
      {action && (
        <Button variant="secondary" className="mt-3" onClick={action.run}>
          {action.label}
        </Button>
      )}
    </div>
  );

  if (variant === "inline") {
    return (
      <div role="alert" className="flex items-center justify-center p-6">
        {body}
      </div>
    );
  }

  return (
    <div role="alert" className="app-viewport">
      <Atmosphere />
      <div className="relative flex h-full items-center justify-center safe-inset">{body}</div>
    </div>
  );
}
