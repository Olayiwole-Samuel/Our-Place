import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { setPartnerNickname } from "@/lib/couple/server";

/**
 * POST /api/couple/nickname  { nickname: string | null }
 * What you call your partner (up to 30 characters; "" or null goes back to
 * their account name). Only `nickname` is read — it's always YOUR nickname
 * for YOUR partner (the database derives both from the JWT).
 * Returns the fresh couple state.
 */
export const POST = authenticatedRoute(
  async ({ request, supabase, user }) => {
    const body = await readJson(request);
    if (!body || !(typeof body.nickname === "string" || body.nickname === null)) return apiError(PAIRING_ERROR.INVALID_REQUEST);
    return apiOk(await setPartnerNickname(supabase, user.id, body.nickname));
  },
  { mutation: true },
);
