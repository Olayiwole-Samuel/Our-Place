import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { deleteVideo, startVideoUpload, videoStorageConfig } from "@/lib/room/videos.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/room/videos → { uploads: boolean } — whether video storage is set up. */
export const GET = authenticatedRoute(async () => apiOk({ uploads: Boolean(videoStorageConfig()) }));

/**
 * POST /api/room/videos { title, kind: "movie" | "clip", size, contentType }
 *   → { id, uploadUrl } — the browser PUTs the file to uploadUrl, then POSTs /api/room/videos/:id.
 */
export const POST = authenticatedRoute(
  async ({ request, user }) => {
    const body = await readJson(request);
    if (!body) return apiError(PAIRING_ERROR.INVALID_REQUEST);
    return apiOk(await startVideoUpload({ admin: createSupabaseAdminClient(), userId: user.id, title: body.title, kind: body.kind, size: body.size, contentType: body.contentType }));
  },
  { mutation: true },
);

/** DELETE /api/room/videos { id } — removes the video and its file. */
export const DELETE = authenticatedRoute(
  async ({ request, user }) => {
    const body = await readJson(request);
    if (typeof body?.id !== "string") return apiError(PAIRING_ERROR.INVALID_REQUEST);
    await deleteVideo({ admin: createSupabaseAdminClient(), userId: user.id, id: body.id });
    return apiOk({ id: body.id, removed: true });
  },
  { mutation: true },
);
