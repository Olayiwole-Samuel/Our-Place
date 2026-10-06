import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/lib/config/env";

/**
 * Server Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user (RLS still applies). Create one per request — never
 * share it across requests.
 *
 * Identity must come from `supabase.auth.getUser()` (verified with Supabase Auth),
 * not from `getSession()` or anything the client sends.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The middleware refreshes the
          // session on every request, so ignoring the write here is safe.
        }
      },
    },
  });
}
