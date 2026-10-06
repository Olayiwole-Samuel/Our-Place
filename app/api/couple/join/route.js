import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { joinCouple, loadCoupleState } from "@/lib/couple/server";

/**
 * POST /api/couple/join  { code }
 * Only `code` is read. Any userId / coupleId / partnerId in the body is ignored —
 * the database derives both partners from the invite and the caller's JWT.
 */
export const POST = authenticatedRoute(
  async ({ request, supabase, user }) => {
    const body = await readJson(request);
    if (typeof body?.code !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);
    await joinCouple(supabase, body.code);
    return apiOk(await loadCoupleState(supabase, user.id));
  },
  { mutation: true },
);
