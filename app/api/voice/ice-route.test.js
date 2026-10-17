import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real route + real ICE module; only Supabase and Cloudflare's HTTP API are faked.
const ME = "11111111-1111-4111-8111-111111111111";
let couple = { status: "paired", couple: { id: "c" }, partner: { id: "p" } };
const supabase = { auth: { getUser: vi.fn() } };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => supabase }));
vi.mock("@/lib/config/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/couple/server", () => ({ loadCoupleState: async () => couple }));

const { GET } = await import("./ice/route");
const { getIceServers, resetIceCache, STUN_SERVERS } = await import("@/lib/voice/ice.server");

const request = () => new Request("https://ourplace.test/api/voice/ice");

beforeEach(() => {
  couple = { status: "paired", couple: { id: "c" }, partner: { id: "p" } };
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetIceCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/voice/ice", () => {
  it("signed out → 401; unpaired → 403 (relay credentials only for a couple)", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(request())).status).toBe(401);
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
    couple = { status: "unpaired" };
    expect((await GET(request())).status).toBe(403);
  });

  it("no TURN configured → STUN only", async () => {
    const response = await GET(request());
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ relay: false, iceServers: STUN_SERVERS });
  });

  it("fixed TURN credentials (any provider) are added after STUN", async () => {
    vi.stubEnv("TURN_URLS", "turn:relay.example.com:3478?transport=udp, turns:relay.example.com:443?transport=tcp, http://nope");
    vi.stubEnv("TURN_USERNAME", "user");
    vi.stubEnv("TURN_CREDENTIAL", "secret");
    const body = await (await GET(request())).json();
    expect(body.relay).toBe(true);
    expect(body.iceServers.at(-1)).toEqual({ urls: ["turn:relay.example.com:3478?transport=udp", "turns:relay.example.com:443?transport=tcp"], username: "user", credential: "secret" });
  });
});

describe("Metered Open Relay TURN", () => {
  const env = { METERED_TURN_APP: "ourplace", METERED_TURN_API_KEY: "key with/odd chars" };
  const metered = (status = 200) =>
    vi.fn(async () =>
      new Response(
        JSON.stringify([
          { urls: "stun:stun.relay.metered.ca:80" },
          { urls: "turn:global.relay.metered.ca:80", username: "u", credential: "c" },
          { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "u", credential: "c" },
        ]),
        { status },
      ),
    );

  it("fetches relay credentials server-side (the API key never reaches the browser) and keeps only TURN entries", async () => {
    const fetcher = metered();
    const result = await getIceServers({ env, fetcher });
    expect(fetcher.mock.calls[0][0]).toBe("https://ourplace.metered.live/api/v1/turn/credentials?apiKey=key%20with%2Fodd%20chars");
    expect(result.relay).toBe(true);
    expect(result.iceServers.slice(1)).toEqual([
      { urls: "turn:global.relay.metered.ca:80", username: "u", credential: "c" },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "u", credential: "c" },
    ]);
    expect(JSON.stringify(result)).not.toContain("odd chars");
  });

  it("tolerates pasted values with spaces, quotes or the whole URL", async () => {
    const fetcher = metered();
    await getIceServers({ env: { METERED_TURN_APP: ' "https://ourplace.metered.live/api/v1/turn/credentials" ', METERED_TURN_API_KEY: " 'https://ourplace.metered.live/api/v1/turn/credentials?apiKey=abc123' " }, fetcher });
    expect(fetcher.mock.calls[0][0]).toBe("https://ourplace.metered.live/api/v1/turn/credentials?apiKey=abc123");
  });

  it("accepts the full subdomain too, caches, and falls back to STUN on failure", async () => {
    const fetcher = metered();
    await getIceServers({ env: { ...env, METERED_TURN_APP: "ourplace.metered.live" }, fetcher });
    await getIceServers({ env, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toMatch(/^https:\/\/ourplace\.metered\.live\//);
    resetIceCache();
    expect(await getIceServers({ env, fetcher: metered(401) })).toEqual({ relay: false, iceServers: STUN_SERVERS });
  });
});

describe("Cloudflare TURN", () => {
  const env = { CLOUDFLARE_TURN_KEY_ID: "key-id", CLOUDFLARE_TURN_KEY_API_TOKEN: "api-token" };
  const cloudflare = (status = 200) =>
    vi.fn(async () =>
      new Response(
        JSON.stringify({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" }] }),
        { status },
      ),
    );

  it("mints short-lived credentials server-side with the API token, and drops port 53", async () => {
    const fetcher = cloudflare();
    const result = await getIceServers({ env, fetcher });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers");
    expect(init.headers.Authorization).toBe("Bearer api-token");
    expect(result.relay).toBe(true);
    expect(result.iceServers.at(-1).urls).toEqual(["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"]);
  });

  it("reuses credentials for half their lifetime, then refreshes", async () => {
    const fetcher = cloudflare();
    let time = 0;
    const now = () => time;
    await getIceServers({ env, fetcher, now });
    time = 11 * 60 * 60 * 1000;
    await getIceServers({ env, fetcher, now });
    expect(fetcher).toHaveBeenCalledTimes(1);
    time = 13 * 60 * 60 * 1000;
    await getIceServers({ env, fetcher, now });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a Cloudflare failure falls back to STUN (voice still works where it can)", async () => {
    expect(await getIceServers({ env, fetcher: cloudflare(500) })).toEqual({ relay: false, iceServers: STUN_SERVERS });
  });
});
