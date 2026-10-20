import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { addMemory, removeMemory, updateMemory } from "@/lib/room/memories.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST   /api/room/memories  { image: "data:image/webp;base64,…", caption?, takenOn? }  → hang a photo
 * PATCH  /api/room/memories  { id, caption?, takenOn? }                                → edit it
 * DELETE /api/room/memories  { id }                                                    → take it down
 * The couple comes from the session; reading happens client-side under RLS.
 */
export const POST = authenticatedRoute(
  async ({ request, user }) => {
    const body = await readJson(request);
    if (typeof body?.image !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);
    return apiOk({ memory: await addMemory({ admin: createSupabaseAdminClient(), userId: user.id, dataUrl: body.image, caption: body.caption, takenOn: body.takenOn ?? null }) });
  },
  { mutation: true },
);

export const PATCH = authenticatedRoute(
  async ({ request, user }) => {
    const body = await readJson(request);
    if (typeof body?.id !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);
    await updateMemory({ admin: createSupabaseAdminClient(), userId: user.id, id: body.id, caption: body.caption, takenOn: body.takenOn ?? null });
    return apiOk({ id: body.id });
  },
  { mutation: true },
);

export const DELETE = authenticatedRoute(
  async ({ request, user }) => {
    const body = await readJson(request);
    if (typeof body?.id !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);
    await removeMemory({ admin: createSupabaseAdminClient(), userId: user.id, id: body.id });
    return apiOk({ id: body.id, removed: true });
  },
  { mutation: true },
);
