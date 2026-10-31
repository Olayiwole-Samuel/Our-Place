import { cookies } from "next/headers";
import { exchangeCode, profile } from "@/lib/music/spotify.server";
import { musicRoute } from "@/lib/music/route.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/music/spotify/callback?code&state — Spotify sends you back here.
 * Checks the state cookie, swaps the code for tokens (kept server-side only,
 * public.couple_spotify) and returns you to Our Place with the music panel open.
 */
export const GET = musicRoute(async ({ request, user, coupleId, admin }) => {
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get("op_spotify_state")?.value;
  store.delete({ name: "op_spotify_state", path: "/api/music/spotify" });
  const back = (result) => Response.redirect(`${url.origin}/lobby?music=${result}`, 302);
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("failed");
  try {
    const tokens = await exchangeCode({ code, origin: url.origin });
    const me = await profile(tokens.accessToken);
    const { error } = await admin.from("couple_spotify").upsert(
      { couple_id: coupleId, user_id: user.id, display_name: me.displayName, refresh_token: tokens.refreshToken, access_token: tokens.accessToken, expires_at: tokens.expiresAt, connected_at: new Date().toISOString() },
      { onConflict: "couple_id" },
    );
    return back(error ? "failed" : "connected");
  } catch {
    return back("failed");
  }
});

/** DELETE: disconnect Spotify (either of you). Songs and playlists you've added stay. */
export const DELETE = musicRoute(
  async ({ coupleId, admin }) => {
    await admin.from("couple_spotify").delete().eq("couple_id", coupleId);
    return { disconnected: true };
  },
  { mutation: true },
);
