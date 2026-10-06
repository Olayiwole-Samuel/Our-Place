import { beforeEach, describe, expect, it, vi } from "vitest";

// The routes run for real; only the Supabase client is replaced by a fake whose
// calls are recorded, so we can assert exactly what reaches the database.
const supabase = { auth: { getUser: vi.fn() }, rpc: vi.fn(), from: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => supabase }));
vi.mock("@/lib/config/env", () => ({ isSupabaseConfigured: () => true }));

const { GET } = await import("./route");
const { POST: invite } = await import("./invite/route");
const { POST: join } = await import("./join/route");

const ORIGIN = "https://ourplace.test";
const ME = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.test" };
const PARTNER = "22222222-2222-4222-8222-222222222222";

function post(path, body, headers = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A chainable stand-in for supabase.from(table).select()...; resolves to `rows[table]`. */
function fakeTables(rows) {
  supabase.from.mockImplementation((table) => {
    const result = { data: rows[table] ?? null, error: null };
    const chain = { select: () => chain, eq: () => chain, gt: () => chain, maybeSingle: async () => result, single: async () => result };
    return chain;
  });
}

const profile = (id, name) => ({ id, display_name: name, avatar_url: null, avatar_thumbnail: null });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  supabase.auth.getUser.mockResolvedValue({ data: { user: ME }, error: null });
});

describe("authentication boundary", () => {
  it("rejects every endpoint without a session", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } });
    for (const response of [
      await GET(new Request(`${ORIGIN}/api/couple`)),
      await invite(post("/api/couple/invite", {})),
      await join(post("/api/couple/join", { code: "A7K9Q2" })),
    ]) {
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("not_authenticated");
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("reports Supabase outages as unavailable, not as signed out", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } });
    const response = await GET(new Request(`${ORIGIN}/api/couple`));
    expect(response.status).toBe(503);
  });

  it("blocks cross-site and non-JSON writes before touching auth or the database", async () => {
    const crossSite = await join(post("/api/couple/join", { code: "A7K9Q2" }, { origin: "https://evil.test" }));
    const noOrigin = await join(post("/api/couple/join", { code: "A7K9Q2" }, { origin: "" }));
    const formPost = await invite(post("/api/couple/invite", "code=A7K9Q2", { "content-type": "application/x-www-form-urlencoded" }));
    for (const response of [crossSite, noOrigin, formPost]) expect(response.status).toBe(403);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/couple/join", () => {
  it("sends only the invite code to the database, ignoring forged ids", async () => {
    supabase.rpc.mockResolvedValue({ data: [{ couple_id: "c1", error: null }], error: null });
    fakeTables({
      users: profile(ME.id, "Me"),
      couple_members: { couple_id: "c1" },
      couples: { id: "c1", paired_at: "2026-10-04T00:00:00Z", user1_id: PARTNER, user2_id: ME.id },
    });

    const response = await join(
      post("/api/couple/join", {
        code: "a7k-9q2",
        userId: PARTNER,
        user1Id: PARTNER,
        user2Id: "33333333-3333-4333-8333-333333333333",
        coupleId: "44444444-4444-4444-8444-444444444444",
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("join_couple", { invite_code: "A7K9Q2" });
    expect((await response.json()).status).toBe("paired");
  });

  it.each([
    ["self_pair", 409, "You can't use your own invite."],
    ["already_paired", 409, "You're already paired."],
    ["invite_unavailable", 410, "This invite is no longer available."],
    ["couple_complete", 409, "This couple is already complete."],
    ["invalid_code", 400, "That invite code isn't valid."],
    ["rate_limited", 429, "Too many tries. Wait a few minutes, then try again."],
  ])("maps a refused join (%s) to friendly copy", async (reason, status, message) => {
    supabase.rpc.mockResolvedValue({ data: [{ couple_id: null, error: reason }], error: null });
    const response = await join(post("/api/couple/join", { code: "A7K9Q2" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code: reason, message } });
  });

  it("rejects malformed codes without calling the database", async () => {
    const response = await join(post("/api/couple/join", { code: "OOPS" }));
    expect(response.status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed bodies", async () => {
    expect((await join(post("/api/couple/join", "{not json"))).status).toBe(400);
    expect((await join(post("/api/couple/join", { code: 123456 }))).status).toBe(400);
    expect((await join(post("/api/couple/join", ["A7K9Q2"]))).status).toBe(400);
  });

  it("never leaks raw database errors", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'duplicate key value violates unique constraint "couple_members_pkey"', code: "23505" } });
    const response = await join(post("/api/couple/join", { code: "A7K9Q2" }));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: { code: "unknown", message: "Something went wrong. Try again." } });
    expect(JSON.stringify(body)).not.toContain("couple_members");
  });
});

describe("POST /api/couple/invite", () => {
  it("takes no input and returns the database-generated code", async () => {
    supabase.rpc.mockResolvedValue({ data: [{ code: "A7K9Q2", expires_at: "2026-10-11T00:00:00Z" }], error: null });
    const response = await invite(post("/api/couple/invite", { userId: PARTNER, code: "AAAAAA" }));
    expect(supabase.rpc).toHaveBeenCalledWith("create_couple_invite");
    expect(await response.json()).toEqual({ invite: { code: "A7K9Q2", expiresAt: "2026-10-11T00:00:00Z" } });
  });

  it("refuses already-paired users with friendly copy", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "pairing:already_paired", code: "P0001" } });
    const response = await invite(post("/api/couple/invite", {}));
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe("You're already paired.");
  });
});

describe("GET /api/couple", () => {
  it("returns the unpaired state with the live invite", async () => {
    fakeTables({ users: profile(ME.id, "Me"), couple_members: null, couple_invites: { code: "A7K9Q2", expires_at: "2026-10-11T00:00:00Z" } });
    const body = await (await GET(new Request(`${ORIGIN}/api/couple`))).json();
    expect(body).toEqual({
      status: "unpaired",
      me: { id: ME.id, displayName: "Me", avatarUrl: null, avatarThumbnail: null },
      invite: { code: "A7K9Q2", expiresAt: "2026-10-11T00:00:00Z" },
    });
  });

  it("returns the paired state with the partner resolved by the server", async () => {
    let usersCall = 0;
    supabase.from.mockImplementation((table) => {
      const data = {
        users: () => (usersCall++ === 0 ? profile(ME.id, "Me") : profile(PARTNER, "Sam")),
        couple_members: () => ({ couple_id: "c1" }),
        couples: () => ({ id: "c1", paired_at: "2026-10-04T00:00:00Z", user1_id: PARTNER, user2_id: ME.id }),
      }[table]();
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data, error: null }), single: async () => ({ data, error: null }) };
      return chain;
    });
    const body = await (await GET(new Request(`${ORIGIN}/api/couple`))).json();
    expect(body.status).toBe("paired");
    expect(body.partner.displayName).toBe("Sam");
    expect(body.couple).toEqual({ id: "c1", pairedAt: "2026-10-04T00:00:00Z", mySlot: 2 });
  });
});
