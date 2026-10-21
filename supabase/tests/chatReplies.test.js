import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Chat replies against the real migrations: reply_to is optional, must point at
// a message of the same couple, survives the original being deleted and is
// delivered on the couple's chat topic.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `reply${++n}@example.test`, name: `Reply ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};

const send = (userId, content, { clientId = null, replyTo = null } = {}) =>
  as(db, userId, async (tx) => (await tx.query("select * from public.send_message($1, $2, $3)", [content, clientId, replyTo])).rows[0]);
const sendError = (userId, content, options) =>
  send(userId, content, options).then(
    () => null,
    (error) => error.message,
  );

let couple;
let other;

beforeAll(async () => {
  db = await createTestDatabase();
  couple = await pair();
  other = await pair();
}, 60_000);
afterAll(() => db?.close());

describe("chat replies", () => {
  it("a reply points at the partner's message; ordinary messages have no reply_to", async () => {
    const original = await send(couple.a, "Dinner at 8?");
    expect(original.reply_to).toBeNull();
    const reply = await send(couple.b, "Yes please", { replyTo: original.id });
    expect(reply).toMatchObject({ sender_id: couple.b, couple_id: couple.coupleId, reply_to: original.id });
    const seen = await as(db, couple.a, async (tx) => (await tx.query("select reply_to from public.messages where id = $1", [reply.id])).rows[0]);
    expect(seen.reply_to).toBe(original.id);
  });

  it("the two-argument call (older app versions) still works", async () => {
    const row = await as(db, couple.a, async (tx) => (await tx.query("select * from public.send_message($1, $2)", ["old client", null])).rows[0]);
    expect(row).toMatchObject({ content: "old client", reply_to: null });
  });

  it("refuses replies to another couple's message, or to a message that doesn't exist", async () => {
    const theirs = await send(other.a, "not yours");
    expect(await sendError(couple.a, "sneaky", { replyTo: theirs.id })).toBe("chat:invalid_reply");
    expect(await sendError(couple.a, "ghost", { replyTo: "0f0f0f0f-0000-4000-8000-000000000000" })).toBe("chat:invalid_reply");
  });

  it("the database itself refuses a cross-couple reply, even outside send_message", async () => {
    const theirs = await send(other.a, "still not yours");
    const forged = db.query("insert into public.messages (couple_id, sender_id, content, reply_to) values ($1, $2, 'forged', $3)", [couple.coupleId, couple.a, theirs.id]);
    await expect(forged).rejects.toThrow(/messages_reply_to_same_couple/);
  });

  it("clients still can't write reply_to directly", async () => {
    const mine = await send(couple.a, "mine");
    const update = as(db, couple.a, (tx) => tx.query("update public.messages set reply_to = $1", [mine.id]));
    await expect(update).rejects.toThrow(/permission denied/);
  });

  it("a deleted original leaves the reply in place, pointing at nothing", async () => {
    const { a, b } = await pair();
    const original = await send(a, "delete me");
    const reply = await send(b, "replying", { replyTo: original.id });
    await db.query("delete from public.messages where id = $1", [original.id]); // e.g. a future "delete message"
    const after = (await db.query("select couple_id, reply_to from public.messages where id = $1", [reply.id])).rows[0];
    expect(after.reply_to).toBeNull();
    expect(after.couple_id).not.toBeNull();
  });

  it("retries stay idempotent and the reply is delivered with its reply_to", async () => {
    const { a, b, coupleId } = await pair();
    const original = await send(a, "ping");
    const clientId = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
    const first = await send(b, "pong", { clientId, replyTo: original.id });
    const retry = await send(b, "pong", { clientId, replyTo: original.id });
    expect(retry.id).toBe(first.id);
    const events = (await db.query("select payload from realtime.messages where topic = $1 order by inserted_at", [`our-place:couple:${coupleId}:chat`])).rows;
    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({ id: original.id, reply_to: null }),
      expect.objectContaining({ id: first.id, reply_to: original.id }),
    ]);
  });
});
