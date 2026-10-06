import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUIRED_BONES } from "@/lib/character/rig";

// Real route handlers + real server modules; only Supabase and the network are faked.
const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://ourplace.test";

const calls = { inserts: [], updates: [], uploads: [], upserts: [], removed: [], signedUploads: [] };
const pendingFiles = new Map();
let rows = [];
let paired = true;

function query(table) {
  const state = { filters: {} };
  const chain = {
    select: () => chain,
    in: (column, values) => ((state.filters[column] = values), chain),
    eq: (column, value) => ((state.filters[column] = [value]), chain),
    maybeSingle: async () => ({ data: rows.find((row) => !state.filters.user_id || state.filters.user_id.includes(row.user_id)) ?? null, error: null }),
    insert: async (value) => (calls.inserts.push({ table, value }), rows.push({ ...value, provider: "ourplace", version: 1 }), { error: null }),
    update: (value) => ({ eq: async (column, id) => (calls.updates.push({ table, value, where: { [column]: id } }), { error: null }) }),
    upsert: async (value) => (calls.upserts.push({ table, value }), { error: null }),
    then: (resolve) => resolve({ data: rows.filter((row) => state.filters.user_id?.includes(row.user_id) ?? true), error: null }),
  };
  return chain;
}

const storage = {
  from: () => ({
    createSignedUrls: async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}?token=x` })), error: null }),
    upload: async (path) => (calls.uploads.push(path), { error: null }),
    download: async (path) => (pendingFiles.has(path) ? { data: new Blob([pendingFiles.get(path)]), error: null } : { data: null, error: { message: "not found" } }),
    list: async () => ({ data: [], error: null }),
    createSignedUploadUrl: async (path) => (calls.signedUploads.push(path), { data: { token: "upload-token", path }, error: null }),
    remove: async (paths) => (calls.removed.push(...paths), { error: null }),
  }),
};

const supabase = { auth: { getUser: vi.fn() }, from: query, storage };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => supabase }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: query, storage }) }));
vi.mock("@/lib/config/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/couple/server", () => ({
  loadCoupleState: async () => (paired ? { status: "paired", partner: { id: PARTNER } } : { status: "unpaired" }),
}));

const { GET, PUT } = await import("./route");
const { POST: token } = await import("./provider/token/route");
const { POST: importModel } = await import("./provider/import/route");
const { isAllowedExportUrl, resetTokenCacheForTests } = await import("@/lib/character/metaperson.server");
const { POST: source } = await import("./source/route");
const { POST: importStart } = await import("./import/start/route");
const { POST: importFinish } = await import("./import/finish/route");

const json = (method, path, body) =>
  new Request(`${ORIGIN}${path}`, { method, headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });

function glbBytes(boneNames) {
  const text = new TextEncoder().encode(JSON.stringify({ nodes: boneNames.map((name) => ({ name })), skins: [{ joints: boneNames.map((_, i) => i) }], meshes: [{}] }));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const out = new Uint8Array(20 + padded.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  return out;
}

beforeEach(() => {
  rows = [];
  pendingFiles.clear();
  paired = true;
  Object.values(calls).forEach((list) => list.splice(0));
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.unstubAllEnvs();
  resetTokenCacheForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/character", () => {
  it("requires a session", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } });
    expect((await GET(new Request(`${ORIGIN}/api/character`))).status).toBe(401);
  });

  it("returns both characters with short-lived signed model URLs (never raw paths as URLs)", async () => {
    rows = [
      { user_id: ME, provider: "ourplace", version: 1, config: { hair: { style: "afro" } }, model_path: null },
      { user_id: PARTNER, provider: "metaperson", version: 1, config: {}, model_path: `${PARTNER}/m.glb` },
    ];
    const body = await (await GET(new Request(`${ORIGIN}/api/character`))).json();
    expect(body.mine.config.hair.style).toBe("afro");
    expect(body.partner.model).toEqual({ key: `${PARTNER}/m.glb`, url: expect.stringContaining("signed.test") });
    expect(JSON.stringify(body)).not.toContain("provider_ref");
  });
});

describe("PUT /api/character", () => {
  it("saves only a normalised config for the session user, ignoring forged fields", async () => {
    const response = await PUT(
      json("PUT", "/api/character", {
        user_id: PARTNER,
        userId: PARTNER,
        model_url: "https://evil.example/x.glb",
        provider: "metaperson",
        config: { body: { height: 999 }, hair: { style: "bun" }, user_id: PARTNER, model_path: `${PARTNER}/x.glb` },
      }),
    );
    expect(response.status).toBe(200);
    expect(calls.inserts).toHaveLength(1);
    const { value } = calls.inserts[0];
    expect(Object.keys(value).sort()).toEqual(["config", "user_id"]);
    expect(value.user_id).toBe(ME);
    expect(value.config.body.height).toBe(1);
    expect(value.config).not.toHaveProperty("user_id");
    expect(value.config).not.toHaveProperty("model_path");
  });

  it("updates an existing character in place", async () => {
    rows = [{ user_id: ME, provider: "ourplace", version: 1, config: {} }];
    await PUT(json("PUT", "/api/character", { config: { hair: { color: "pink" } } }));
    expect(calls.updates[0]).toMatchObject({ where: { user_id: ME } });
    expect(Object.keys(calls.updates[0].value)).toEqual(["config"]);
  });

  it("rejects missing configs and cross-site writes", async () => {
    expect((await PUT(json("PUT", "/api/character", { nope: true }))).status).toBe(400);
    const crossSite = new Request(`${ORIGIN}/api/character`, { method: "PUT", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: "{}" });
    expect((await PUT(crossSite)).status).toBe(403);
  });
});

describe("MetaPerson token", () => {
  it("is honestly unavailable without credentials", async () => {
    const response = await token(json("POST", "/api/character/provider/token", {}));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("provider_unavailable");
  });

  it("returns only a short-lived token — never the client secret", async () => {
    vi.stubEnv("METAPERSON_CLIENT_ID", "client-id-123");
    vi.stubEnv("METAPERSON_CLIENT_SECRET", "super-secret-456");
    const fetchMock = vi.fn(async () => Response.json({ access_token: "tok", expires_in: 36000 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await token(json("POST", "/api/character/provider/token", {}));
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ accessToken: "tok" });
    expect(text).not.toContain("super-secret-456");
    expect(text).not.toContain("client-id-123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.avatarsdk.com/o/token/");
    expect(init.body).toBe("grant_type=client_credentials");
  });

  it("requires a paired user", async () => {
    vi.stubEnv("METAPERSON_CLIENT_ID", "id");
    vi.stubEnv("METAPERSON_CLIENT_SECRET", "secret");
    paired = false;
    expect((await token(json("POST", "/api/character/provider/token", {}))).status).toBe(403);
  });
});

describe("MetaPerson import", () => {
  beforeEach(() => {
    vi.stubEnv("METAPERSON_CLIENT_ID", "id");
    vi.stubEnv("METAPERSON_CLIENT_SECRET", "secret");
  });

  it("refuses URLs outside the provider's hosts (SSRF)", () => {
    for (const url of [
      "http://models.avatarsdk.com/a.glb",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/a.glb",
      "https://avatarsdk.com.evil.com/a.glb",
      "https://evil.com/avatarsdk.com/a.glb",
      "https://user:pass@avatarsdk.com/a.glb",
      "https://avatarsdk.com:8443/a.glb",
      "not a url",
    ]) {
      expect(isAllowedExportUrl(url), url).toBe(false);
    }
    expect(isAllowedExportUrl("https://exports.avatarsdk.com/a.glb")).toBe(true);
  });

  it("stores a validated full-body model under the SESSION user's folder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(glbBytes(REQUIRED_BONES.map((n) => `mixamorig:${n}`)))));
    const response = await importModel(
      json("POST", "/api/character/provider/import", { url: "https://exports.avatarsdk.com/a.glb", avatarCode: "abc", userId: PARTNER }),
    );
    expect(response.status).toBe(200);
    expect(calls.uploads[0]).toMatch(new RegExp(`^${ME}/[0-9a-f-]{36}\\.glb$`));
    expect(calls.upserts[0].value).toMatchObject({ user_id: ME, provider: "metaperson", provider_ref: "abc" });
  });

  it("rejects head-only or non-GLB exports and stores nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(glbBytes(["Head", "Neck"]))));
    const headOnly = await importModel(json("POST", "/api/character/provider/import", { url: "https://exports.avatarsdk.com/a.glb" }));
    expect(headOnly.status).toBe(422);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>")));
    const notGlb = await importModel(json("POST", "/api/character/provider/import", { url: "https://exports.avatarsdk.com/a.glb" }));
    expect(notGlb.status).toBe(422);
    expect(calls.uploads).toEqual([]);
    expect(calls.upserts).toEqual([]);
  });

  it("reports provider download failures with friendly copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const response = await importModel(json("POST", "/api/character/provider/import", { url: "https://exports.avatarsdk.com/a.glb" }));
    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toBe("We couldn't create your character yet.");
  });
});

describe("importing your own 3D character", () => {
  const PENDING = `${ME}/upload-11111111-2222-4333-8444-555555555555.glb`;

  it("hands out a signed upload slot inside YOUR folder only", async () => {
    const body = await (await importStart(json("POST", "/api/character/import/start", { userId: PARTNER }))).json();
    expect(body.path).toMatch(new RegExp(`^${ME}/upload-[0-9a-f-]{36}\.glb$`));
    expect(body.token).toBe("upload-token");
  });

  it("validates the upload, stores it under a fresh name and always deletes the pending file", async () => {
    pendingFiles.set(PENDING, glbBytes(REQUIRED_BONES));
    const response = await importFinish(json("POST", "/api/character/import/finish", { path: PENDING }));
    expect(response.status).toBe(200);
    expect(calls.uploads[0]).toMatch(new RegExp(`^${ME}/[0-9a-f-]{36}\.glb$`));
    expect(calls.upserts[0].value).toMatchObject({ user_id: ME, provider: "imported", library_model: null });
    expect(calls.removed).toContain(PENDING);
  });

  it("refuses head-only uploads and keeps nothing", async () => {
    pendingFiles.set(PENDING, glbBytes(["Head", "Neck"]));
    const response = await importFinish(json("POST", "/api/character/import/finish", { path: PENDING }));
    expect(response.status).toBe(422);
    expect(calls.uploads).toEqual([]);
    expect(calls.upserts).toEqual([]);
    expect(calls.removed).toContain(PENDING);
  });

  it("refuses paths outside your own pending slot (other users, traversal, final models)", async () => {
    for (const path of [
      `${PARTNER}/upload-11111111-2222-4333-8444-555555555555.glb`,
      `${ME}/../${PARTNER}/upload-11111111-2222-4333-8444-555555555555.glb`,
      `${ME}/11111111-2222-4333-8444-555555555555.glb`,
      "upload.glb",
    ]) {
      expect((await importFinish(json("POST", "/api/character/import/finish", { path }))).status, path).toBe(400);
    }
  });
});

describe("choosing a character source", () => {
  it("rejects unknown gallery ids and unknown sources", async () => {
    expect((await source(json("POST", "/api/character/source", { source: "gallery", id: "not_in_gallery" }))).status).toBe(400);
    expect((await source(json("POST", "/api/character/source", { source: "metaperson" }))).status).toBe(400);
    expect(calls.upserts).toEqual([]);
  });

  it("switching back to the designed character clears any model for the session user", async () => {
    rows = [{ user_id: ME, provider: "imported", version: 1, config: {}, model_path: `${ME}/old.glb` }];
    expect((await source(json("POST", "/api/character/source", { source: "designed", userId: PARTNER }))).status).toBe(200);
    expect(calls.upserts[0].value).toMatchObject({ user_id: ME, provider: "ourplace", model_path: null });
    expect(calls.removed).toContain(`${ME}/old.glb`);
  });
});
