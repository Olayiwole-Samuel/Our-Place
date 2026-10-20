import { apiError, apiOk, authenticatedRoute } from "@/lib/api/route";
import { PAIRING_ERROR } from "@/lib/couple/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/room/youtube?id=<11 chars> → { id, title } — the video's title from
 * YouTube's public oEmbed endpoint (fetched by the server: no CORS, and the
 * browser never talks to a third party for it). Only the video id is sent.
 */
export const GET = authenticatedRoute(async ({ request }) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return apiError(PAIRING_ERROR.INVALID_REQUEST);
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return apiOk({ id, title: "", embeddable: response.status !== 401 && response.status !== 403 });
    const data = await response.json();
    return apiOk({ id, title: String(data.title ?? "").slice(0, 200), embeddable: true });
  } catch {
    return apiOk({ id, title: "", embeddable: true });
  }
});
