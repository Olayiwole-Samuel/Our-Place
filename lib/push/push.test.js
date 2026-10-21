import { beforeEach, describe, expect, it, vi } from "vitest";

// Push decisions with an in-memory database and a fake push service.
const sent = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (subscription, payload) => {
      if (subscription.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    }),
  },
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const COUPLE = "33333333-3333-4333-8333-333333333333";
let tables;

/** Just enough of supabase-js's query builder for lib/push/push.server.js. */
function fakeAdmin() {
  return {
    from(table) {
      const filters = [];
      let order = null;
      let limit = null;
      const rows = () => {
        let list = (tables[table] ?? []).filter((row) => filters.every(([col, value]) => row[col] === value));
        if (order) list = [...list].sort((a, b) => (a[order.col] < b[order.col] ? -1 : 1) * (order.ascending ? 1 : -1));
        return limit ? list.slice(0, limit) : list;
      };
      const builder = {
        select: () => builder,
        eq: (col, value) => (filters.push([col, value]), builder),
        order: (col, { ascending = true } = {}) => ((order = { col, ascending }), builder),
        limit: (n) => ((limit = n), builder),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve) => resolve({ data: rows(), error: null }),
        upsert: async (row, { onConflict }) => {
          const keys = onConflict.split(",");
          const list = (tables[table] ??= []);
          const at = list.findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (at >= 0) list[at] = { ...list[at], ...row };
          else list.push({ id: `${table}-${list.length}`, ...row });
          return { error: null };
        },
        update: (patch) => ({
          eq: async (col, value) => {
            for (const row of tables[table] ?? []) if (row[col] === value) Object.assign(row, patch);
            return { error: null };
          },
        }),
        delete: () => {
          const del = {
            eq: (col, value) => {
              filters.push([col, value]);
              tables[table] = (tables[table] ?? []).filter((row) => !filters.every(([c, v]) => row[c] === v));
              return del;
            },
          };
          return del;
        },
      };
      return builder;
    },
  };
}

const minutesAgo = (n, now) => new Date(now - n * 60_000).toISOString();
const now = Date.parse("2026-10-20T20:00:00Z");

beforeEach(() => {
  sent.length = 0;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  tables = {
    couple_members: [
      { user_id: A, couple_id: COUPLE },
      { user_id: B, couple_id: COUPLE },
    ],
    users: [
      { id: A, display_name: "Arnold Preview" },
      { id: B, display_name: "King Preview" },
    ],
    couple_visits: [{ couple_id: COUPLE, user_id: B, last_at: minutesAgo(60, now) }],
    push_subscriptions: [{ id: "s1", user_id: B, endpoint: "https://push.example/b", p256dh: "k", auth: "a" }],
    push_log: [],
    messages: [{ id: "m1", sender_id: A, couple_id: COUPLE, content: "Coming over tonight? 🍿", created_at: minutesAgo(0.1, now) }],
  };
});

const load = () => import("./push.server");

describe("phone notifications", () => {
  it("tells an away partner that you arrived — once per 20 minutes", async () => {
    const { notifyArrival } = await load();
    expect(await notifyArrival({ admin: fakeAdmin(), userId: A, now })).toEqual({ sent: 1 });
    expect(sent[0].payload).toMatchObject({ body: "❤️ Arnold is in Our Place — come join", tag: "arrived" });
    expect(await notifyArrival({ admin: fakeAdmin(), userId: A, now: now + 5 * 60_000 })).toMatchObject({ sent: 0, reason: "throttled" });
  });

  it("uses the name your partner calls you, when they've set one", async () => {
    tables.couple_members[1].partner_nickname = "Hubby"; // B's name for A
    const { notifyArrival, notifyMessage } = await load();
    await notifyArrival({ admin: fakeAdmin(), userId: A, now });
    await notifyMessage({ admin: fakeAdmin(), userId: A, messageId: "m1", now });
    expect(sent.map((s) => s.payload)).toMatchObject([{ body: "❤️ Hubby is in Our Place — come join" }, { title: "Hubby" }]);
  });

  it("stays quiet when the partner is already in the app", async () => {
    tables.couple_visits[0].last_at = minutesAgo(1, now);
    const { notifyArrival, notifyMessage } = await load();
    expect(await notifyArrival({ admin: fakeAdmin(), userId: A, now })).toMatchObject({ sent: 0, reason: "partner_here" });
    expect(await notifyMessage({ admin: fakeAdmin(), userId: A, messageId: "m1", now })).toMatchObject({ sent: 0, reason: "partner_here" });
    expect(sent).toEqual([]);
  });

  it("previews your own new message to an away partner; never someone else's message", async () => {
    const { notifyMessage } = await load();
    expect(await notifyMessage({ admin: fakeAdmin(), userId: A, messageId: "m1", now })).toEqual({ sent: 1 });
    expect(sent[0].payload).toMatchObject({ title: "Arnold", body: "Coming over tonight? 🍿", tag: "message" });
    await expect(notifyMessage({ admin: fakeAdmin(), userId: B, messageId: "m1", now: now + 60_000 })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("drops subscriptions the push service says are gone", async () => {
    tables.push_subscriptions[0].endpoint = "https://push.example/gone";
    const { notifyArrival } = await load();
    expect(await notifyArrival({ admin: fakeAdmin(), userId: A, now })).toEqual({ sent: 0 });
    expect(tables.push_subscriptions).toEqual([]);
  });
});
