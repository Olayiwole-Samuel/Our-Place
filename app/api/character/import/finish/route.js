import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { loadCharacters } from "@/lib/character/server";
import { finishImport } from "@/lib/character/sources.server";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * POST /api/character/import/finish  { path }
 * Validates the uploaded file (real GLB, full-body rigged humanoid, embedded
 * resources only, size and detail limits) and makes it YOUR character. The path
 * must be your own pending-upload slot.
 */
export const POST = authenticatedRoute(
  async ({ request, supabase, user }) => {
    const body = await readJson(request);
    if (typeof body?.path !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);
    await finishImport({ admin: createSupabaseAdminClient(), userId: user.id, path: body.path });
    const { mine } = await loadCharacters(supabase, { userId: user.id });
    return apiOk({ character: mine });
  },
  { mutation: true },
);
