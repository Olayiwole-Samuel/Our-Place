import { apiError, apiOk, authenticatedRoute } from "@/lib/api/route";
import { getAccessToken, isMetaPersonConfigured } from "@/lib/character/metaperson.server";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { loadCoupleState } from "@/lib/couple/server";

/**
 * POST /api/character/provider/token
 * A short-lived MetaPerson access token for the Creator iframe. The client
 * secret never leaves the server. Paired users only.
 */
export const POST = authenticatedRoute(
  async ({ supabase, user }) => {
    if (!isMetaPersonConfigured()) return apiError(PAIRING_ERROR.PROVIDER_UNAVAILABLE);
    const couple = await loadCoupleState(supabase, user.id);
    if (couple.status !== "paired") return apiError(PAIRING_ERROR.NOT_PAIRED);
    return apiOk(await getAccessToken());
  },
  { mutation: true },
);
