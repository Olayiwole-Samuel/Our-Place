import { apiOk, authenticatedRoute } from "@/lib/api/route";
import { pushConfigured } from "@/lib/push/push.server";
import { videoStorageConfig } from "@/lib/room/videos.server";
import { isAgoraConfigured } from "@/lib/voice/agora.server";
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
    voiceProvider: ["daily", "p2p"].includes(process.env.NEXT_PUBLIC_VOICE_PROVIDER) ? process.env.NEXT_PUBLIC_VOICE_PROVIDER : isAgoraConfigured() ? "agora" : "p2p",
    turnRelay: turnProvider() ?? "none",
    pushNotifications: pushConfigured(),
    videoUploads: Boolean(videoStorageConfig()),
    region: process.env.VERCEL_REGION ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  }),
);
