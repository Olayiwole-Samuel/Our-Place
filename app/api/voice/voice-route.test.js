import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real route + real Daily server module; only Supabase and Daily's HTTP API are faked.
const ME = "11111111-1111-4111-8111-111111111111";
const COUPLE = "33333333-3333-4333-8333-333333333333";
const OTHER_COUPLE = "44444444-4444-4444-8444-444444444444";
const ORIGIN = "https://ourplace.test";
const KEY = "a".repeat(64);

let couple = { status: "paired", couple: { id: COUPLE }, partner: { id: "p" } };
const supabase = { auth: { getUser: vi.fn() } };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => supabase }));
vi.mock("@/lib/config/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/couple/server", () => ({ loadCoupleState: async () => couple }));

const { POST } = await import("./token/route");
const { coupleRoomName } = await import("@/lib/voice/daily.server");

const request = (body = {}, headers = {}) =>
  new Request(`${ORIGIN}/api/voice/token`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

let dailyCalls;
let rooms;
function fakeDaily() {
  dailyCalls = [];
  rooms = new Map();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname.replace("/v1", "");
      const body = init.body ? JSON.parse(init.body) : null;
      dailyCalls.push({ method: init.method ?? "GET", path, body, auth: init.headers?.Authorization });
      const reply = (status, data) => new Response(JSON.stringify(data), { status });
      if (path.startsWith("/rooms/")) {
        const room = rooms.get(path.slice(7));
        return room ? reply(200, room) : reply(404, { error: "not-found" });
      }
      if (path === "/rooms") {
        const room = { name: body.name, url: `https://ourplace.daily.co/${body.name}`, privacy: body.privacy, config: body.properties };
        rooms.set(body.name, room);
        return reply(200, room);
      }
      if (path === "/meeting-tokens") return reply(200, { token: `token-for-${body.properties.user_id}` });
      return reply(404, {});
    }),
  );
}

beforeEach(() => {
  couple = { status: "paired", couple: { id: COUPLE }, partner: { id: "p" } };
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
  vi.stubEnv("DAILY_API_KEY", KEY);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fakeDaily();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/voice/token", () => {
  it("creates the couple's private two-person room once and returns a token for the caller", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const data = await response.json();
    const name = coupleRoomName(COUPLE);
    expect(data).toEqual({ url: `https://ourplace.daily.co/${name}`, token: `token-for-${ME}` });
    const created = dailyCalls.find((call) => call.path === "/rooms");
    expect(created.body).toMatchObject({ name, privacy: "private", properties: { max_participants: 2, start_audio_off: true, start_video_off: true } });
    const token = dailyCalls.find((call) => call.path === "/meeting-tokens").body.properties;
    expect(token).toMatchObject({ room_name: name, user_id: ME, is_owner: false });
    expect(token.exp).toBeGreaterThan(Date.now() / 1000);
    // Second request reuses the room.
    await POST(request());
    expect(dailyCalls.filter((call) => call.path === "/rooms")).toHaveLength(1);
  });

  it("ignores any room, couple or user id in the request body", async () => {
    await (await POST(request({ room: "someone-else", coupleId: OTHER_COUPLE, userId: "x" }))).json();
    const token = dailyCalls.find((call) => call.path === "/meeting-tokens").body.properties;
    expect(token.room_name).toBe(coupleRoomName(COUPLE));
    expect(token.user_id).toBe(ME);
  });

  it("room names are unguessable and differ per couple", () => {
    expect(coupleRoomName(COUPLE)).not.toContain(COUPLE);
    expect(coupleRoomName(COUPLE)).not.toBe(coupleRoomName(OTHER_COUPLE));
    expect(coupleRoomName(COUPLE)).toMatch(/^op-[0-9a-f]{32}$/);
  });

  it("requires a session, a pairing and a same-origin JSON request", async () => {
    expect((await POST(request({}, { origin: "https://evil.test" }))).status).toBe(403);
    couple = { status: "unpaired" };
    expect((await POST(request())).status).toBe(403);
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } });
    expect((await POST(request())).status).toBe(401);
    expect(dailyCalls).toHaveLength(0);
  });

  it("reports voice as not set up when DAILY_API_KEY is missing", async () => {
    vi.stubEnv("DAILY_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("voice_unavailable");
  });

  it("never leaks the API key or Daily's error to the browser", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "authentication-error", info: "bad key" }), { status: 401 })));
    const response = await POST(request());
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("authentication-error");
    expect(JSON.parse(text).error.code).toBe("voice_failed");
  });

  it("sends the key only to Daily, as a bearer token", async () => {
    await POST(request());
    expect(dailyCalls.every((call) => call.auth === `Bearer ${KEY}`)).toBe(true);
  });
});
