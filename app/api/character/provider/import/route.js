import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { importExport, isMetaPersonConfigured } from "@/lib/character/metaperson.server";
import { loadCharacters } from "@/lib/character/server";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { loadCoupleState } from "@/lib/couple/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * POST /api/character/provider/import  { url, avatarCode, avatarState }
 * Copies a MetaPerson export into private storage after validating it is a
 * full-body, rigged GLB from the provider's own host, and makes it YOUR
 * character. The user id comes from the session, never the body.
 */
export const POST = authenticatedRoute(
  async ({ request, supabase, user }) => {
    if (!isMetaPersonConfigured()) return apiError(PAIRING_ERROR.PROVIDER_UNAVAILABLE);
    const couple = await loadCoupleState(supabase, user.id);
    if (couple.status !== "paired") return apiError(PAIRING_ERROR.NOT_PAIRED);
    const body = await readJson(request);
    if (typeof body?.url !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);

    await importExport({
      admin: createSupabaseAdminClient(),
      userId: user.id,
      url: body.url,
      avatarCode: body.avatarCode,
      avatarState: body.avatarState,
    });
    const { mine } = await loadCharacters(supabase, { userId: user.id });
    return apiOk({ character: mine });
  },
  { mutation: true },
);
