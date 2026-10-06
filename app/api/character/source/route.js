import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { loadCharacters } from "@/lib/character/server";
import { useDesignedCharacter, useGalleryCharacter } from "@/lib/character/sources.server";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/character/source  { source: "designed" } | { source: "gallery", id }
 * Switches YOUR character's source. Gallery ids are checked against the shipped
 * gallery; the row is always the session user's.
 */
export const POST = authenticatedRoute(
  async ({ request, supabase, user }) => {
    const body = await readJson(request);
    const admin = createSupabaseAdminClient();
    if (body?.source === "designed") await useDesignedCharacter({ admin, userId: user.id });
    else if (body?.source === "gallery" && typeof body.id === "string") await useGalleryCharacter({ admin, userId: user.id, galleryId: body.id });
    else return apiError(PAIRING_ERROR.INVALID_REQUEST);
    const { mine } = await loadCharacters(supabase, { userId: user.id });
    return apiOk({ character: mine });
  },
  { mutation: true },
);
