import { apiOk, authenticatedRoute } from "@/lib/api/route";
import { turnProvider } from "@/lib/voice/ice.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/diagnostics — for checking a deployment from a signed-in browser.
 * Reports only WHETHER things are configured (never values), so a missing
 * server key or relay shows up as `false` instead of features silently failing.
 */
export const GET = authenticatedRoute(async () =>
  apiOk({
    serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    voiceProvider: process.env.NEXT_PUBLIC_VOICE_PROVIDER === "daily" ? "daily" : "p2p",
    turnRelay: turnProvider() ?? "none",
    region: process.env.VERCEL_REGION ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  }),
);
