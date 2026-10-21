import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { uploadParts } from "@/lib/room/videos.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/room/videos/:id/parts { uploadId?, partNumbers: [1, 2, …], peek? }
 *   → { status: "uploading", uploadId, parts, partBytes, done: [partNumber…], uploadedBytes, urls } | { status: "ready" }
 * Which pieces of an upload B2 already has, plus signed URLs to send the asked-for ones
 * (up to 24 per call). Without uploadId the video's open upload is found (resume on any
 * device). Uploader only.
 */
export const POST = authenticatedRoute(
  async ({ request, user, params }) => {
    const body = await readJson(request);
    if (!body || (body.uploadId !== undefined && typeof body.uploadId !== "string")) return apiError(PAIRING_ERROR.INVALID_REQUEST);
    return apiOk(await uploadParts({ admin: createSupabaseAdminClient(), userId: user.id, id: params.id, uploadId: body.uploadId, partNumbers: body.partNumbers ?? [], peek: body.peek === true }));
  },
  { mutation: true },
);
