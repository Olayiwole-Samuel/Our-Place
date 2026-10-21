import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { shortName } = await import("./names");
const { loadCoupleState, setPartnerNickname } = await import("./server");

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";

/** Just enough of a user-scoped supabase-js client for loadCoupleState. */
function fakeSupabase({ nickname = null, nicknameError = null } = {}) {
  const rows = {
    users: [
      { id: ME, display_name: "Arnold Me", avatar_url: null, avatar_thumbnail: null },
      { id: PARTNER, display_name: "King Partner", avatar_url: null, avatar_thumbnail: null },
    ],
    couple_members: [{ user_id: ME, couple_id: "c1", partner_nickname: nickname }],
    couples: [{ id: "c1", paired_at: "2026-03-06T00:00:00Z", user1_id: ME, user2_id: PARTNER }],
  };
  const calls = [];
  return {
    calls,
    rpc: vi.fn(async (fn, args) => {
      calls.push([fn, args]);
      rows.couple_members[0].partner_nickname = args.nickname || null;
      return { data: args.nickname || null, error: null };
    }),
    from(table) {
      let columns = "*";
      const filters = [];
      const builder = {
        select: (cols) => ((columns = cols), builder),
        eq: (col, value) => (filters.push([col, value]), builder),
        result() {
          // Before the nickname migration the column doesn't exist: PostgREST errors.
          if (table === "couple_members" && columns.includes("partner_nickname") && nicknameError) return { data: null, error: nicknameError };
          return { data: rows[table].find((row) => filters.every(([col, value]) => row[col] === value)) ?? null, error: null };
        },
        maybeSingle: async () => builder.result(),
        single: async () => builder.result(),
      };
      return builder;
    },
  };
}

describe("partner names", () => {
  it("a nickname is used whole; an account name is shortened to its first word", () => {
    expect(shortName({ displayName: "King Partner" })).toBe("King");
    expect(shortName({ displayName: "My King", nickname: "My King" })).toBe("My King");
    expect(shortName(null, "Your person")).toBe("Your person");
    expect(shortName({ displayName: "   " }, "You")).toBe("You");
  });

  it("the couple state shows your nickname as their name, keeping the account name", async () => {
    const state = await loadCoupleState(fakeSupabase({ nickname: "My King" }), ME);
    expect(state.partner).toMatchObject({ id: PARTNER, displayName: "My King", nickname: "My King", accountName: "King Partner" });
    expect(state.me.displayName).toBe("Arnold Me"); // only your partner is renamed
  });

  it("no nickname — or the database not updated yet — keeps their account name", async () => {
    expect((await loadCoupleState(fakeSupabase(), ME)).partner).toMatchObject({ displayName: "King Partner", nickname: null });
    const before = await loadCoupleState(fakeSupabase({ nicknameError: { message: 'column couple_members.partner_nickname does not exist', code: "42703" } }), ME);
    expect(before.status).toBe("paired");
    expect(before.partner.displayName).toBe("King Partner");
  });

  it("saving tidies the name, refuses over 30 characters, and returns the fresh couple", async () => {
    const supabase = fakeSupabase();
    const state = await setPartnerNickname(supabase, ME, "  Baby\u0007  Girl ");
    expect(supabase.calls).toEqual([["set_partner_nickname", { nickname: "Baby Girl" }]]);
    expect(state.partner.displayName).toBe("Baby Girl");
    await expect(setPartnerNickname(supabase, ME, "x".repeat(31))).rejects.toMatchObject({ code: "invalid_request" });
    await expect(setPartnerNickname(supabase, ME, 42)).rejects.toMatchObject({ code: "invalid_request" });
    expect((await setPartnerNickname(supabase, ME, null)).partner.displayName).toBe("King Partner");
  });
});
