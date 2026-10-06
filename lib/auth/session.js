import "server-only";

/**
 * The single place that decides who the request belongs to.
 *
 * Uses `auth.getUser()`, which validates the access token with Supabase Auth on
 * every call — never `getSession()`, which only decodes the cookie and could be
 * forged. Distinguishes "signed out / expired / invalid" from "Supabase is
 * unreachable" so a network blip never looks like a sign-out.
 *
 * @returns {Promise<{state: "authenticated", user: object} | {state: "signed_out"} | {state: "unavailable"}>}
 */
export async function getSessionUser(supabase) {
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch {
    return { state: "unavailable" };
  }

  const { data, error } = result;
  if (!error && data?.user) return { state: "authenticated", user: data.user };
  if (error && isTransientAuthError(error)) return { state: "unavailable" };
  // No session, expired or revoked token, deleted user: all mean "sign in again".
  return { state: "signed_out" };
}

function isTransientAuthError(error) {
  return error.name === "AuthRetryableFetchError" || error.status === 0 || error.status >= 500;
}
