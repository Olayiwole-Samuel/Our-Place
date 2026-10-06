import { apiError, apiOk, authenticatedRoute } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { loadCoupleState } from "@/lib/couple/server";
import { reportError } from "@/lib/errors";
import { createVoiceAccess, isDailyConfigured } from "@/lib/voice/daily.server";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/token — join credentials for the caller's couple voice room.
 *
 * authenticated user → paired (couple read under RLS) → room derived from THAT
 * couple id → token bound to the room with the caller's own id. The request body
 * is ignored: no client-chosen room, couple or user id is ever used.
 */
export const POST = authenticatedRoute(
  async ({ supabase, user }) => {
    if (!isDailyConfigured()) return apiError(PAIRING_ERROR.VOICE_UNAVAILABLE);
    const couple = await loadCoupleState(supabase, user.id);
    if (couple.status !== "paired") return apiError(PAIRING_ERROR.NOT_PAIRED);
    try {
      return apiOk(await createVoiceAccess({ coupleId: couple.couple.id, userId: user.id }));
    } catch (error) {
      reportError(error, { route: "voice/token" });
      return apiError(PAIRING_ERROR.VOICE_FAILED);
    }
  },
  { mutation: true },
);
