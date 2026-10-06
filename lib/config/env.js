/**
 * Public (browser-safe) configuration.
 *
 * Each NEXT_PUBLIC_* variable must be read with a literal `process.env.NAME`
 * expression — Next.js inlines them at build time and cannot inline dynamic
 * lookups. Server secrets live in ./server-env.js, never here.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

/**
 * Describes what is wrong with the Supabase config, or null when it is usable.
 * Never includes the values themselves, so it is safe to log.
 */
export function supabaseConfigProblem() {
  const { supabaseUrl, supabaseAnonKey } = publicEnv;
  if (!supabaseUrl || !supabaseAnonKey) return "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set";
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return "NEXT_PUBLIC_SUPABASE_URL is not a URL (expected https://<project-ref>.supabase.co)";
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return "NEXT_PUBLIC_SUPABASE_URL must use https";
  }
  return null;
}

export function isSupabaseConfigured() {
  return supabaseConfigProblem() === null;
}

/** Returns the Supabase public config or throws a configuration error. */
export function requireSupabasePublicEnv() {
  if (!isSupabaseConfigured()) {
    throw new Error(`Supabase is not configured: ${supabaseConfigProblem()} (see .env.example).`);
  }
  return { url: publicEnv.supabaseUrl, anonKey: publicEnv.supabaseAnonKey };
}
