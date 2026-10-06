import "server-only";
import { authenticatedRoute, readJson } from "@/lib/api/route";
import { reportError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GameSessionError, gameSessionErrorMessage, gameSessionErrorStatus } from "./sessionErrors";
import { createGameSessionService } from "./sessions.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function gameError(code, detail = null) {
  return Response.json(
    { error: { code, message: gameSessionErrorMessage(code), ...(detail ? { detail } : {}) } },
    { status: gameSessionErrorStatus(code), headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Route wrapper for the game API: verified user (Supabase Auth), same-origin
 * JSON for mutations, a validated session id, the game service, and calm,
 * human error copy (never raw database errors).
 */
export function gameRoute(handler, { mutation = false } = {}) {
  return authenticatedRoute(
    async ({ request, user, params }) => {
      if (params?.id !== undefined && !UUID.test(params.id)) return gameError("not_found");
      const body = mutation ? await readJson(request) : null;
      if (mutation && body === null) return gameError("invalid_request");
      try {
        const service = createGameSessionService({ admin: createSupabaseAdminClient() });
        const data = await handler({ service, userId: user.id, params, body });
        return Response.json(data ?? {}, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        if (error instanceof GameSessionError) {
          if (["unknown", "start_failed", "questions_unavailable"].includes(error.code)) reportError(error.cause ?? error, { route: "games" });
          return gameError(error.code, error.detail);
        }
        reportError(error, { route: "games" });
        return gameError("unknown");
      }
    },
    { mutation },
  );
}
