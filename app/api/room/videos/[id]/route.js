import { apiOk, authenticatedRoute } from "@/lib/api/route";
import { finishVideoUpload, playVideoUrl } from "@/lib/room/videos.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/room/videos/:id → { url } — a short-lived streaming link for your couple's video. */
export const GET = authenticatedRoute(async ({ user, params }) => apiOk({ url: await playVideoUrl({ admin: createSupabaseAdminClient(), userId: user.id, id: params.id }) }));

/** POST /api/room/videos/:id — the upload finished: the server checks the file and marks it ready. */
export const POST = authenticatedRoute(async ({ user, params }) => apiOk(await finishVideoUpload({ admin: createSupabaseAdminClient(), userId: user.id, id: params.id })), { mutation: true });
