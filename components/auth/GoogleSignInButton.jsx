"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { reportError } from "@/lib/errors";
import { toast } from "@/store/toastStore";

/** Google's "G" mark — brand asset; its colors are Google's, not part of our palette. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.8c4.3-4 6.9-9.9 6.9-17.3z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function GoogleSignInButton({ disabled = false, describedBy }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      // Supabase SDK loads on demand — the welcome screen stays light.
      const { signInWithGoogle } = await import("@/lib/auth/client");
      const { ok, error } = await signInWithGoogle();
      // On success the browser is already navigating to Google; stay pending.
      if (!ok) throw error;
    } catch (error) {
      reportError(error, { operation: "start google sign-in" });
      toast("We couldn't reach Google. Try again.", "error");
      setPending(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="lg"
      className="min-w-64"
      onClick={handleClick}
      pending={pending}
      pendingLabel="Opening Google…"
      disabled={disabled}
      aria-describedby={describedBy}
    >
      <GoogleMark />
      Continue with Google
    </Button>
  );
}
