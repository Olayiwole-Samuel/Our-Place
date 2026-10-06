import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/lib/config/env";
import { requireServiceRoleKey } from "@/lib/config/server-env";

/**
 * Service-role Supabase client. BYPASSES Row Level Security.
 *
 * Use only for operations that legitimately cannot run as the user (e.g. the
 * game server persisting a validated result, or pairing two accounts). Callers
 * must perform their own authorization before using it. Never import from a
 * client component — `server-only` enforces this at build time.
 */
export function createSupabaseAdminClient() {
  const { url } = requireSupabasePublicEnv();
  return createClient(url, requireServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
