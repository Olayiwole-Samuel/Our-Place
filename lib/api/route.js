import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/config/env";
import { PAIRING_ERROR, PairingError, pairingErrorMessage, pairingErrorStatus } from "@/lib/couple/errors";
import { reportError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function apiError(code, status = pairingErrorStatus(code)) {
  return Response.json(
    { error: { code, message: pairingErrorMessage(code) } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function apiOk(data) {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Cross-site request forgery guard for state-changing requests: the browser must
 * report our own origin and send JSON (which cross-site forms cannot do without
 * a CORS preflight we never grant). Supabase auth cookies are also SameSite=Lax.
 */
export function isTrustedMutation(request) {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type") ?? "";
  return origin === new URL(request.url).origin && contentType.startsWith("application/json");
}

/**
 * Wraps a Route Handler so it only runs for an authenticated user. The handler
 * receives the verified `user` and a per-request Supabase client acting as that
 * user (so RLS applies). Identity is never read from the request body.
 */
export function authenticatedRoute(handler, { mutation = false } = {}) {
  return async (request, context) => {
    if (!isSupabaseConfigured()) return apiError(PAIRING_ERROR.UNAVAILABLE);
    if (mutation && !isTrustedMutation(request)) return apiError(PAIRING_ERROR.INVALID_REQUEST, 403);

    try {
      const supabase = await createSupabaseServerClient();
      const session = await getSessionUser(supabase);
      if (session.state === "unavailable") return apiError(PAIRING_ERROR.UNAVAILABLE);
      if (session.state !== "authenticated") return apiError(PAIRING_ERROR.NOT_AUTHENTICATED);
      const params = (await context?.params) ?? {};
      return await handler({ request, supabase, user: session.user, params });
    } catch (error) {
      if (error instanceof PairingError) return apiError(error.code);
      reportError(error, { route: new URL(request.url).pathname });
      return apiError(PAIRING_ERROR.UNKNOWN);
    }
  };
}

/** Reads a JSON body, returning null (never throwing) when it is missing or malformed. */
export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
