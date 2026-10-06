import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { removeCouplePhoto, saveCouplePhoto } from "@/lib/couple/photos.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * PUT /api/couple/photos/:slot  { image: "data:image/webp;base64,…", whose?: "mine" | "partner" }
 * Sets one of YOUR couple's photo slots (together_a | together_b | portrait).
 * The couple — and who "partner" is — come from the session, never the request.
 */
export const PUT = authenticatedRoute(
  async ({ request, user, params }) => {
    const body = await readJson(request);
    if (typeof body?.image !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);
    return apiOk(await saveCouplePhoto({ admin: createSupabaseAdminClient(), userId: user.id, slot: params.slot, whose: body.whose ?? "mine", dataUrl: body.image }));
  },
  { mutation: true },
);

/** DELETE /api/couple/photos/:slot  { whose?: "mine" | "partner" } — clears the slot (boards fall back to defaults). */
export const DELETE = authenticatedRoute(
  async ({ request, user, params }) => {
    const body = (await readJson(request)) ?? {};
    await removeCouplePhoto({ admin: createSupabaseAdminClient(), userId: user.id, slot: params.slot, whose: body.whose ?? "mine" });
    return apiOk({ slot: params.slot, removed: true });
  },
  { mutation: true },
);
