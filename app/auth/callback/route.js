import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config/env";
import { reportError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth return point. Exchanges the one-time PKCE code from Google/Supabase for a
 * session cookie, then always lands on "/" (no caller-supplied redirect target, so
 * this can't be used as an open redirect). "/" decides what the user sees next.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const home = (authError) => {
    const target = new URL("/", url.origin);
    if (authError) target.searchParams.set("auth_error", authError);
    return NextResponse.redirect(target);
  };

  if (!isSupabaseConfigured()) return home("failed");
  if (url.searchParams.get("error")) {
    // e.g. the user closed Google's consent screen.
    return home(url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
  }

  const code = url.searchParams.get("code");
  if (!code) return home("failed");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    reportError(error, { operation: "oauth callback" });
    return home("failed");
  }
  return home();
}
