import { apiError, apiOk, authenticatedRoute, readJson } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";
import { notifyArrival, notifyMessage, pushConfigured, removeSubscription, saveSubscription } from "@/lib/push/push.server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/push → { enabled } — whether push notifications are set up on the server. */
export const GET = authenticatedRoute(async () => apiOk({ enabled: pushConfigured() }));

/**
 * POST /api/push { action: "subscribe", subscription } | { action: "unsubscribe", endpoint }
 *              | { action: "arrived" } | { action: "message", messageId }
 * The recipient is always the caller's partner (from membership); a client can
 * only announce its own arrival or its own message.
 */
export const POST = authenticatedRoute(
  async ({ request, user }) => {
    const body = await readJson(request);
    const admin = createSupabaseAdminClient();
    switch (body?.action) {
      case "subscribe":
        await saveSubscription({ admin, userId: user.id, subscription: body.subscription });
        return apiOk({ subscribed: true });
      case "unsubscribe":
        await removeSubscription({ admin, userId: user.id, endpoint: body.endpoint });
        return apiOk({ subscribed: false });
      case "arrived":
        return apiOk(await notifyArrival({ admin, userId: user.id }));
      case "message":
        return apiOk(await notifyMessage({ admin, userId: user.id, messageId: body.messageId }));
      default:
        return apiError(PAIRING_ERROR.INVALID_REQUEST);
    }
  },
  { mutation: true },
);
