import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authorizeUrl, spotifyConfig } from "@/lib/music/spotify.server";
import { musicError, musicRoute } from "@/lib/music/route.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/music/spotify/login → Spotify's sign-in page. A random `state` in an
 * HttpOnly cookie ties the callback to this browser (no forged sign-ins).
 */
export const GET = musicRoute(async ({ request }) => {
  if (!spotifyConfig()) return musicError("not_configured");
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("op_spotify_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/music/spotify", maxAge: 600 });
  return Response.redirect(authorizeUrl({ origin: new URL(request.url).origin, state }), 302);
});
