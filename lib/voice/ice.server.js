import "server-only";
import { reportError } from "@/lib/errors";

/**
 * ICE servers for direct (peer-to-peer) voice.
 *
 * STUN alone lets two browsers find each other's public address, which works on
 * most home Wi-Fi but often FAILS between phones on mobile data (carrier-grade /
 * symmetric NAT). A TURN relay fixes that: when a direct path is impossible the
 * encrypted audio is relayed (the relay can't decrypt it — WebRTC media is
 * end-to-end DTLS-SRTP). Configure one of (server-side env, never NEXT_PUBLIC_):
 *
 *   Metered Open Relay (free 20 GB/month, sign-up without a card)
 *     METERED_TURN_APP (your app's subdomain: <app>.metered.live), METERED_TURN_API_KEY
 *   Cloudflare Realtime TURN (short-lived credentials; asks for a card)
 *     CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_KEY_API_TOKEN
 *   Any TURN provider with fixed credentials (Metered, ExpressTURN, coturn…)
 *     TURN_URLS (comma-separated turn:/turns: URLs), TURN_USERNAME, TURN_CREDENTIAL
 *
 * Without either, voice still works wherever a direct path exists.
 */
export const STUN_SERVERS = Object.freeze([{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }]);

const CLOUDFLARE_TTL_SECONDS = 24 * 60 * 60;
let cloudflareCache = null; // { iceServers, expiresAt }
let meteredCache = null; // { iceServers, expiresAt }
const METERED_CACHE_MS = 6 * 60 * 60 * 1000;

export function turnProvider(env = process.env) {
  if (env.METERED_TURN_APP && env.METERED_TURN_API_KEY) return "metered";
  if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_KEY_API_TOKEN) return "cloudflare";
  if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) return "static";
  return null;
}

function staticServers(env) {
  const urls = env.TURN_URLS.split(",")
    .map((url) => url.trim())
    .filter((url) => /^turns?:/.test(url));
  if (!urls.length) return null;
  return [{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
}

const isTurnServer = (server) => server && [].concat(server.urls ?? []).some((url) => /^turns?:/.test(url));

async function meteredServers(env, fetcher, now) {
  if (meteredCache && meteredCache.expiresAt > now()) return meteredCache.iceServers;
  const app = String(env.METERED_TURN_APP).replace(/\.metered\.live$/i, "").replace(/[^a-z0-9-]/gi, "");
  // The API key stays on the server; browsers only ever see the relay credentials.
  const response = await fetcher(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_TURN_API_KEY)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Metered TURN credentials: HTTP ${response.status}`);
  const data = await response.json();
  const list = Array.isArray(data) ? data : Array.isArray(data?.iceServers) ? data.iceServers : [];
  const iceServers = list.filter(isTurnServer).map(({ urls, username, credential }) => ({ urls, username, credential }));
  if (!iceServers.length) throw new Error("Metered TURN credentials: no TURN servers in the response");
  meteredCache = { iceServers, expiresAt: now() + METERED_CACHE_MS };
  return iceServers;
}

async function cloudflareServers(env, fetcher, now) {
  if (cloudflareCache && cloudflareCache.expiresAt > now()) return cloudflareCache.iceServers;
  const response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: CLOUDFLARE_TTL_SECONDS }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Cloudflare TURN credentials: HTTP ${response.status}`);
  const data = await response.json();
  // Cloudflare returns { iceServers: [...] } (or a single object in older responses).
  const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
  // Port 53 is blocked by some browsers (Chrome rejects it); drop those URLs.
  const iceServers = list
    .map((server) => ({ ...server, urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url)) }))
    .filter((server) => server.urls.length);
  if (!iceServers.length) throw new Error("Cloudflare TURN credentials: empty response");
  // Reuse for half their life, so a caller never receives nearly-expired credentials.
  cloudflareCache = { iceServers, expiresAt: now() + (CLOUDFLARE_TTL_SECONDS * 1000) / 2 };
  return iceServers;
}

/** STUN plus TURN when configured. Never throws: on a TURN failure it reports and returns STUN only. */
export async function getIceServers({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  const provider = turnProvider(env);
  try {
    if (provider === "metered") return { relay: true, iceServers: [...STUN_SERVERS, ...(await meteredServers(env, fetcher, now))] };
    if (provider === "cloudflare") return { relay: true, iceServers: [...STUN_SERVERS, ...(await cloudflareServers(env, fetcher, now))] };
    if (provider === "static") {
      const turn = staticServers(env);
      if (turn) return { relay: true, iceServers: [...STUN_SERVERS, ...turn] };
    }
  } catch (error) {
    reportError(error, { feature: "voice-turn" });
  }
  return { relay: false, iceServers: STUN_SERVERS };
}

/** For tests. */
export function resetIceCache() {
  cloudflareCache = null;
  meteredCache = null;
}
