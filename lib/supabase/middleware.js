import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, publicEnv } from "@/lib/config/env";

/**
 * Refreshes the Supabase auth session cookie on each request so Server
 * Components see a valid session. It does not gate routes: "/" resolves who the
 * user is server-side (lib/auth/viewer.js) and API routes check via
 * lib/api/route.js, so authorization never depends on middleware alone.
 */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Must run immediately after client creation: it validates and refreshes the token.
  // A Supabase outage must never take the whole site down: on failure the request
  // continues and the page itself shows the "couldn't connect" state.
  try {
    await supabase.auth.getUser();
  } catch {
    return NextResponse.next({ request });
  }

  return response;
}
