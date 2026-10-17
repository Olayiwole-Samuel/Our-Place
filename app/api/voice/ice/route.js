import { apiError, apiOk, authenticatedRoute } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { loadCoupleState } from "@/lib/couple/server";
import { getIceServers } from "@/lib/voice/ice.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/voice/ice — ICE servers (STUN + TURN relay when configured) for
 * direct voice. Only for signed-in, paired users, so relay credentials aren't
 * handed to strangers. Never cached: TURN credentials are short-lived.
 */
export const GET = authenticatedRoute(async ({ supabase, user }) => {
  const couple = await loadCoupleState(supabase, user.id);
  if (couple.status !== "paired") return apiError(PAIRING_ERROR.NOT_PAIRED);
  return apiOk(await getIceServers());
});
