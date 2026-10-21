import { apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { finishVideoUpload, playVideoUrl } from "@/lib/room/videos.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/room/videos/:id → { url } — a short-lived streaming link for your couple's video. */
export const GET = authenticatedRoute(async ({ user, params }) => apiOk({ url: await playVideoUrl({ admin: createSupabaseAdminClient(), userId: user.id, id: params.id }) }));

/**
 * POST /api/room/videos/:id { uploadId } — every piece is sent: the server checks them,
 * completes the upload and marks the video ready → { status: "ready" }, or
 * { status: "uploading", done } if pieces are still missing (carry on, then try again).
 */
export const POST = authenticatedRoute(
  async ({ request, user, params }) => {
    const body = await readJson(request);
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId : undefined;
    return apiOk(await finishVideoUpload({ admin: createSupabaseAdminClient(), userId: user.id, id: params.id, uploadId }));
  },
  { mutation: true },
);
