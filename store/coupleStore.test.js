import { beforeEach, describe, expect, it, vi } from "vitest";

const coupleApi = { getState: vi.fn(), createInvite: vi.fn(), join: vi.fn() };
vi.mock("@/lib/couple/client", () => ({ coupleApi }));

const { createCoupleStore } = await import("./coupleStore");
const { authStateFromViewer } = await import("./authStore");
const { selectStage } = await import("@/components/app/AppStage");

const me = { id: "me", displayName: "Me", avatarUrl: null, avatarThumbnail: null };
const partner = { id: "p", displayName: "Sam", avatarUrl: null, avatarThumbnail: null };
const unpaired = { status: "unpaired", me, invite: null };
const paired = { status: "paired", me, partner, couple: { id: "c1", pairedAt: "2026-10-04T00:00:00Z" } };

beforeEach(() => vi.clearAllMocks());

describe("couple store", () => {
  it("hydrates from the server state", () => {
    expect(createCoupleStore(paired).getState()).toMatchObject({ status: "paired", partner, couple: paired.couple, justPaired: false });
    expect(createCoupleStore(unpaired).getState()).toMatchObject({ status: "unpaired", partner: null, couple: null });
    expect(createCoupleStore(null).getState().status).toBe("loading");
  });

  it("joining applies the server's state and marks the pairing moment", async () => {
    coupleApi.join.mockResolvedValue({ ok: true, data: paired });
    const store = createCoupleStore(unpaired);
    await store.getState().join("A7K9Q2");
    expect(store.getState()).toMatchObject({ status: "paired", partner, justPaired: true });
    store.getState().acknowledgePairing();
    expect(store.getState().justPaired).toBe(false);
  });

  it("a failed join changes nothing", async () => {
    coupleApi.join.mockResolvedValue({ ok: false, code: "invalid_code" });
    const store = createCoupleStore(unpaired);
    const result = await store.getState().join("ZZZZZZ");
    expect(result).toEqual({ ok: false, code: "invalid_code" });
    expect(store.getState().status).toBe("unpaired");
  });

  it("the inviter sees the pairing when polling picks it up", async () => {
    coupleApi.getState.mockResolvedValue({ ok: true, data: paired });
    const store = createCoupleStore({ ...unpaired, invite: { code: "A7K9Q2", expiresAt: "x" } });
    await store.getState().refresh();
    expect(store.getState()).toMatchObject({ status: "paired", invite: null, justPaired: true });
  });

  it("a returning paired user is not shown the celebration again", async () => {
    coupleApi.getState.mockResolvedValue({ ok: true, data: paired });
    const store = createCoupleStore(paired);
    await store.getState().refresh();
    expect(store.getState().justPaired).toBe(false);
  });

  it("reports an expired session", async () => {
    const onSessionExpired = vi.fn();
    coupleApi.createInvite.mockResolvedValue({ ok: false, code: "not_authenticated" });
    const store = createCoupleStore(unpaired, { onSessionExpired });
    await store.getState().createInvite();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("re-syncs when the server says the user is already paired", async () => {
    coupleApi.createInvite.mockResolvedValue({ ok: false, code: "already_paired" });
    coupleApi.getState.mockResolvedValue({ ok: true, data: paired });
    const store = createCoupleStore(unpaired);
    await store.getState().createInvite();
    expect(store.getState().status).toBe("paired");
  });
});

describe("auth state and stage selection", () => {
  it("maps every server viewer to an auth state", () => {
    expect(authStateFromViewer({ status: "signed_in", user: { id: "me" } })).toEqual({ status: "authenticated", user: { id: "me" } });
    expect(authStateFromViewer({ status: "signed_out" })).toEqual({ status: "unauthenticated", user: null });
    expect(authStateFromViewer({ status: "unavailable" }).status).toBe("unavailable");
    expect(authStateFromViewer({ status: "unconfigured" }).status).toBe("unconfigured");
  });

  it.each([
    ["unauthenticated", "loading", false, "welcome"],
    ["unconfigured", "loading", false, "welcome"],
    ["unavailable", "loading", false, "unavailable"],
    ["loading", "paired", false, "loading"],
    ["authenticated", "unpaired", false, "pairing"],
    ["authenticated", "paired", true, "celebrate"],
    ["authenticated", "paired", false, "place"],
    ["authenticated", "loading", false, "loading"],
  ])("auth=%s couple=%s justPaired=%s → %s", (auth, couple, justPaired, stage) => {
    expect(selectStage(auth, couple, justPaired)).toBe(stage);
  });
});
