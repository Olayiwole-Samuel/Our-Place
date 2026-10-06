import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, rpc, signUp } from "./db";

// Exercises the real Realtime authorization policies the way Supabase Realtime
// does: realtime.topic() is set to the channel being joined, then RLS on
// realtime.messages decides whether the user may receive (SELECT) or send (INSERT).
let db;
let n = 0;
const newUser = () => signUp(db, { email: `rt${++n}@example.test`, name: `RT ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};
const topic = (coupleId, channel = "presence") => `our-place:couple:${coupleId}:${channel}`;

/** Simulates Realtime's authorization check for `userId` on `channelTopic`. */
function realtimeAs(userId, channelTopic, fn) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('realtime.topic', $1, true)", [channelTopic]);
    if (userId) {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await tx.exec("set local role authenticated");
    } else {
      await tx.exec("set local role anon");
    }
    return fn(tx);
  });
}

const canSend = (userId, channelTopic, extension = "presence") =>
  realtimeAs(userId, channelTopic, (tx) =>
    tx.query("insert into realtime.messages (topic, extension, private) values ($1, $2, true)", [channelTopic, extension]),
  ).then(
    () => true,
    () => false,
  );

const canReceive = async (userId, channelTopic) => {
  // A message exists on the topic (written by the system); can the user see it?
  await db.query("insert into realtime.messages (topic, extension, private) values ($1, 'presence', true)", [channelTopic]);
  const rows = await realtimeAs(userId, channelTopic, async (tx) => (await tx.query("select id from realtime.messages limit 1")).rows);
  return rows.length > 0;
};

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);
afterAll(() => db?.close());

describe("couple Realtime channels", () => {
  it("both partners can join, send and receive on their couple's channels", async () => {
    const { a, b, coupleId } = await pair();
    for (const user of [a, b]) {
      expect(await canSend(user, topic(coupleId, "presence"), "presence")).toBe(true);
      expect(await canSend(user, topic(coupleId, "presence"), "broadcast")).toBe(true);
      expect(await canReceive(user, topic(coupleId, "presence"))).toBe(true);
    }
  });

  it("a member of another couple is refused (no cross-couple presence)", async () => {
    const one = await pair();
    const two = await pair();
    expect(await canSend(two.a, topic(one.coupleId))).toBe(false);
    expect(await canReceive(two.a, topic(one.coupleId))).toBe(false);
  });

  it("unpaired and anonymous clients are refused", async () => {
    const { coupleId } = await pair();
    const loner = await newUser();
    expect(await canSend(loner, topic(coupleId))).toBe(false);
    expect(await canReceive(loner, topic(coupleId))).toBe(false);
    expect(await canSend(null, topic(coupleId))).toBe(false);
    expect(await canReceive(null, topic(coupleId))).toBe(false);
  });

  it("rejects topics that only look similar to the couple's", async () => {
    const { a, coupleId } = await pair();
    expect(await canSend(a, `our-place:couple:${coupleId}`)).toBe(false); // no channel suffix
    expect(await canSend(a, `our-place:couple:${coupleId}x:presence`)).toBe(false);
    expect(await canSend(a, `x-our-place:couple:${coupleId}:presence`)).toBe(false);
    expect(await canSend(a, "our-place:couple:%:presence")).toBe(false);
    expect(await canSend(a, "")).toBe(false);
  });

  it("only allows presence and broadcast extensions", async () => {
    const { a, coupleId } = await pair();
    expect(await canSend(a, topic(coupleId), "postgres_changes")).toBe(false);
  });
});
