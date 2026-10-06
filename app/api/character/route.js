import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { loadCharacters, saveCharacterConfig } from "@/lib/character/server";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { loadCoupleState } from "@/lib/couple/server";

export const dynamic = "force-dynamic";

/** GET /api/character — your character and (if paired) your partner's, for rendering. */
export const GET = authenticatedRoute(async ({ supabase, user }) => {
  const couple = await loadCoupleState(supabase, user.id);
  const partnerId = couple.status === "paired" ? couple.partner.id : null;
  return apiOk(await loadCharacters(supabase, { userId: user.id, partnerId }));
});

/**
 * PUT /api/character  { config }
 * Saves YOUR look. Only `config` is read; the row is always the session user's.
 */
export const PUT = authenticatedRoute(
  async ({ request, supabase, user }) => {
    const body = await readJson(request);
    if (!body?.config) return apiError(PAIRING_ERROR.INVALID_REQUEST);
    return apiOk({ character: await saveCharacterConfig(supabase, user.id, body.config) });
  },
  { mutation: true },
);
