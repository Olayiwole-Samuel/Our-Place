"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Starts Google sign-in. The browser leaves the app for Google and returns to
 * /auth/callback (PKCE). Resolves only if the redirect could not start.
 */
export async function signInWithGoogle() {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      // Always offer the account chooser, so a shared device can switch accounts.
      queryParams: { prompt: "select_account" },
    },
  });
  return { ok: !error, error };
}

/** Signs out this device only (other devices stay signed in). */
export async function signOut() {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return { ok: !error, error };
}
