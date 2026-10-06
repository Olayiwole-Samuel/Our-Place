import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
vi.mock("@/lib/config/env", () => ({ isSupabaseConfigured: () => true }));

const { GET } = await import("./route");
const call = (query) => GET(new Request(`https://ourplace.test/auth/callback${query}`));

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("OAuth callback", () => {
  it("exchanges the code for a session and goes home", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await call("?code=abc");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("https://ourplace.test/");
  });

  it("reports a failed exchange (e.g. expired or replayed code)", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid flow state" } });
    expect((await call("?code=stale")).headers.get("location")).toBe("https://ourplace.test/?auth_error=failed");
  });

  it("distinguishes a cancelled Google consent", async () => {
    expect((await call("?error=access_denied")).headers.get("location")).toBe("https://ourplace.test/?auth_error=cancelled");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("handles a missing code", async () => {
    expect((await call("")).headers.get("location")).toBe("https://ourplace.test/?auth_error=failed");
  });

  it("cannot be used as an open redirect", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await call("?code=abc&next=https://evil.test&redirect_to=//evil.test");
    expect(response.headers.get("location")).toBe("https://ourplace.test/");
  });
});
