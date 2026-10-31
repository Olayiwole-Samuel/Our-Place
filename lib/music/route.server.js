import "server-only";
import { authenticatedRoute } from "@/lib/api/route";
import { reportError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SpotifyError } from "./spotify.server";
import { YouTubeError } from "./youtube.server";

/**
 * Route wrapper for the music API: the verified user, their couple (from the
 * database, never the request), the service-role client for the Spotify tokens
 * and song matches, and calm error copy.
 */
const MESSAGES = {
  not_paired: "You need to be paired first.",
  not_configured: "Music isn't set up on the server yet (Spotify / YouTube keys).",
  not_connected: "Connect Spotify first.",
  spotify_denied: "Spotify said no — this Spotify account may need to be added to the app's users in the Spotify dashboard.",
  spotify_unavailable: "Spotify isn't answering right now. Try again in a moment.",
  not_found: "Couldn't find that song on YouTube.",
  quota: "Today's song lookups are used up — try again tomorrow (songs you've played before still work).",
  youtube_unavailable: "YouTube isn't answering right now. Try again in a moment.",
  invalid_request: "That request wasn't understood.",
  unknown: "Something went wrong. Try again.",
};
const STATUS = { not_paired: 403, not_configured: 503, not_connected: 409, spotify_denied: 403, not_found: 404, quota: 429, invalid_request: 400 };

export function musicError(code) {
  return Response.json({ error: { code, message: MESSAGES[code] ?? MESSAGES.unknown } }, { status: STATUS[code] ?? 502, headers: { "Cache-Control": "no-store" } });
}

export function musicRoute(handler, { mutation = false } = {}) {
  return authenticatedRoute(
    async ({ request, supabase, user, params }) => {
      const { data: membership } = await supabase.from("couple_members").select("couple_id").eq("user_id", user.id).maybeSingle();
      if (!membership) return musicError("not_paired");
      try {
        const data = await handler({ request, supabase, user, params, coupleId: membership.couple_id, admin: createSupabaseAdminClient() });
        return data instanceof Response ? data : Response.json(data ?? {}, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        if (error instanceof SpotifyError || error instanceof YouTubeError) {
          if (["spotify_unavailable", "youtube_unavailable"].includes(error.code)) reportError(error, { route: "music" });
          return musicError(error.code);
        }
        throw error;
      }
    },
    { mutation },
  );
}
