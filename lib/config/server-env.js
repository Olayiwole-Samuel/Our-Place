import "server-only";

/**
 * Server-only secrets. The `server-only` import makes the build fail if this
 * module is ever pulled into a client component, so secrets cannot leak into
 * the browser bundle by accident.
 */
export function requireServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (see .env.example).");
  }
  return key;
}
