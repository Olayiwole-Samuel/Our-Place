import { afterEach, describe, expect, it, vi } from "vitest";

async function loadWith(url, key) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", key);
  return import("./env");
}

afterEach(() => vi.unstubAllEnvs());

describe("Supabase public config", () => {
  it("accepts a project URL and key", async () => {
    const env = await loadWith("https://abcd.supabase.co", "public-key");
    expect(env.supabaseConfigProblem()).toBeNull();
    expect(env.isSupabaseConfigured()).toBe(true);
  });

  it("rejects missing values", async () => {
    const env = await loadWith("", "public-key");
    expect(env.isSupabaseConfigured()).toBe(false);
  });

  it("rejects a key pasted into the URL variable, without echoing it", async () => {
    const env = await loadWith("sb_publishable_not_a_url", "public-key");
    const problem = env.supabaseConfigProblem();
    expect(problem).toMatch(/not a URL/);
    expect(problem).not.toContain("sb_publishable");
    expect(() => env.requireSupabasePublicEnv()).toThrow(/not a URL/);
  });

  it("requires https outside local development", async () => {
    expect((await loadWith("http://abcd.supabase.co", "k")).isSupabaseConfigured()).toBe(false);
    expect((await loadWith("http://127.0.0.1:54321", "k")).isSupabaseConfigured()).toBe(true);
  });
});
