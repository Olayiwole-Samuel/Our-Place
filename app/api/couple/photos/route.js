import { apiOk, authenticatedRoute } from "@/lib/api/route";
import { loadCouplePhotos } from "@/lib/couple/photos.server";

export const dynamic = "force-dynamic";

/** GET /api/couple/photos — the signed-in user's couple photos (signed URLs; RLS picks the couple). */
export const GET = authenticatedRoute(async ({ supabase, user }) => apiOk(await loadCouplePhotos(supabase, user.id)));
