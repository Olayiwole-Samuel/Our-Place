import { apiOk, authenticatedRoute } from "@/lib/api/route";
import { loadCoupleState } from "@/lib/couple/server";

export const dynamic = "force-dynamic";

/** GET /api/couple — the signed-in user's couple state. */
export const GET = authenticatedRoute(async ({ supabase, user }) => apiOk(await loadCoupleState(supabase, user.id)));
