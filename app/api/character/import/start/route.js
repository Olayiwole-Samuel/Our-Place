import { apiOk, authenticatedRoute } from "@/lib/api/route";
import { startImport } from "@/lib/character/sources.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/character/import/start
 * A one-time signed upload URL for YOUR pending-upload slot. The browser uploads
 * the .glb straight to private storage (no request-size limits, no proxying).
 */
export const POST = authenticatedRoute(async ({ user }) => apiOk(await startImport({ admin: createSupabaseAdminClient(), userId: user.id })), {
  mutation: true,
});
