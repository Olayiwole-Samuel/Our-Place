import { apiOk, authenticatedRoute } from "@/lib/api/route";
import { createInvite } from "@/lib/couple/server";

/**
 * POST /api/couple/invite — returns the caller's active invite, creating one if
 * needed. Takes no input: the inviter is always the authenticated user.
 */
export const POST = authenticatedRoute(async ({ supabase }) => apiOk({ invite: await createInvite(supabase) }), {
  mutation: true,
});
