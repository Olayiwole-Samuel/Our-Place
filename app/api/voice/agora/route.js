import { apiError, apiOk, authenticatedRoute } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { loadCoupleState } from "@/lib/couple/server";
import { reportError } from "@/lib/errors";
import { createAgoraAccess, isAgoraConfigured } from "@/lib/voice/agora.server";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/agora — join credentials for the caller's couple voice channel.
 *
 * authenticated user → paired (couple read under RLS) → channel derived from THAT
 * couple id → token bound to the channel and the caller's own id. The request
 * body is ignored. 503 voice_unavailable when Agora isn't configured: the client
 * then falls back to direct voice.
 */
export const POST = authenticatedRoute(
  async ({ supabase, user }) => {
    if (!isAgoraConfigured()) return apiError(PAIRING_ERROR.VOICE_UNAVAILABLE);
    const couple = await loadCoupleState(supabase, user.id);
    if (couple.status !== "paired") return apiError(PAIRING_ERROR.NOT_PAIRED);
    try {
      return apiOk(createAgoraAccess({ coupleId: couple.couple.id, userId: user.id }));
    } catch (error) {
      reportError(error, { route: "voice/agora" });
      return apiError(PAIRING_ERROR.VOICE_FAILED);
    }
  },
  { mutation: true },
);
