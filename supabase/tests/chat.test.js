import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDatabase, rpc, signUp } from "./db";

// Couple chat and emotes against the real migrations: RLS, the only write paths
// (send_message / send_emote), validation, rate limits and Realtime delivery.
let db;
let n = 0;
const newUser = () => signUp(db, { email: `chat${++n}@example.test`, name: `Chat ${n}` });
const pair = async () => {
  const a = await newUser();
  const b = await newUser();
  const { code } = await rpc.createInvite(db, a);
  return { a, b, coupleId: await rpc.join(db, b, code) };
};

const send = (userId, content, clientId = null) =>
  as(db, userId, async (tx) => (await tx.query("select * from public.send_message($1, $2)", [content, clientId])).rows[0]);
const sendError = (userId, content) =>
  send(userId, content).then(
    () => null,
    (error) => error.message,
  );
const read = (userId) =>
  as(db, userId, async (tx) => (await tx.query("select id, sender_id, content from public.messages order by created_at, id")).rows);
const emote = (userId, name) =>
  as(db, userId, (tx) => tx.query("select public.send_emote($1)", [name])).then(
    () => null,
    (error) => error.message,
  );
const broadcasts = async (coupleId, channel) =>
  (await db.query("select event, payload from realtime.messages where topic = $1 order by inserted_at", [`our-place:couple:${coupleId}:${channel}`])).rows;

let coupleA;
let coupleB;

beforeAll(async () => {
  db = await createTestDatabase();
  coupleA = await pair(); // users a + b
  coupleB = await pair(); // users c + d (named a/b inside the object)
}, 60_000);
afterAll(() => db?.close());

describe("chat messages", () => {
  it("both partners send and read; sender and couple come from the session", async () => {
    const fromA = await send(coupleA.a, "  Hey ❤️  ");
    expect(fromA).toMatchObject({ sender_id: coupleA.a, couple_id: coupleA.coupleId, type: "text", content: "Hey ❤️" });
    await send(coupleA.b, "I'm here");
    for (const user of [coupleA.a, coupleA.b]) {
      expect((await read(user)).map((row) => row.content)).toEqual(["Hey ❤️", "I'm here"]);
    }
  });

  it("isolates couples: nobody reads another couple's messages", async () => {
    await send(coupleB.a, "couple B only");
    expect((await read(coupleA.a)).some((row) => row.content === "couple B only")).toBe(false);
    expect((await read(coupleB.b)).map((row) => row.content)).toEqual(["couple B only"]);
    expect(await read(null).catch(() => "denied")).toBe("denied");
  });

  it("refuses direct writes, forged senders and other couples' ids", async () => {
    const forged = as(db, coupleA.a, (tx) =>
      tx.query("insert into public.messages (couple_id, sender_id, content) values ($1, $2, 'forged')", [coupleB.coupleId, coupleB.a]),
    );
    await expect(forged).rejects.toThrow(/permission denied/);
    const update = as(db, coupleA.a, (tx) => tx.query("update public.messages set content = 'edited'"));
    await expect(update).rejects.toThrow(/permission denied/);
    const remove = as(db, coupleA.a, (tx) => tx.query("delete from public.messages"));
    await expect(remove).rejects.toThrow(/permission denied/);
  });

  it("validates content", async () => {
    const { a } = await pair();
    expect(await sendError(a, "")).toBe("chat:empty");
    expect(await sendError(a, " \n\t ")).toBe("chat:empty");
    expect(await sendError(a, "x".repeat(2001))).toBe("chat:too_long");
    expect((await send(a, "x".repeat(2000))).content).toHaveLength(2000);
    expect((await send(a, "<script>alert(1)</script>\u0007")).content).toBe("<script>alert(1)</script>"); // stored as text; control chars stripped
  });

  it("refuses unpaired and signed-out senders", async () => {
    const loner = await newUser();
    expect(await sendError(loner, "hello")).toBe("chat:not_paired");
    expect(await sendError(null, "hello")).toMatch(/permission denied|chat:not_authenticated/);
  });

  it("is idempotent per client id (retries never duplicate)", async () => {
    const { a } = await pair();
    const clientId = "3f1c1c4e-7b7e-4b8a-9a55-0c1f3d2e4a10";
    const first = await send(a, "once", clientId);
    const retry = await send(a, "once", clientId);
    expect(retry.id).toBe(first.id);
    expect((await read(a)).filter((row) => row.content === "once")).toHaveLength(1);
  });

  it("rate-limits bursts per sender", async () => {
    const { a, b } = await pair();
    for (let i = 0; i < 8; i += 1) await send(a, `burst ${i}`);
    expect(await sendError(a, "one too many")).toBe("chat:rate_limited");
    expect(await sendError(b, "partner unaffected")).toBeNull();
  });

  it("delivers each new row on the couple's private chat topic, written by the database", async () => {
    const { a, coupleId } = await pair();
    const row = await send(a, "delivered");
    const [event] = await broadcasts(coupleId, "chat");
    expect(event.event).toBe("message");
    expect(event.payload).toMatchObject({ id: row.id, sender_id: a, content: "delivered", type: "text" });
  });
});

describe("emotes", () => {
  it("broadcasts as the caller to their own couple only", async () => {
    const { a, coupleId } = await pair();
    expect(await emote(a, "heart")).toBeNull();
    const events = await broadcasts(coupleId, "emotes");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "emote", payload: { sender_id: a, emote: "heart" } });
  });

  it("accepts exactly the seven emotes", async () => {
    const users = await Promise.all(Array.from({ length: 7 }, () => pair()));
    const names = ["wave", "laugh", "cry", "kiss", "dance", "angry", "heart"];
    for (const [i, name] of names.entries()) expect(await emote(users[i].a, name)).toBeNull();
    const { a } = await pair();
    expect(await emote(a, "celebrate")).toBe("emote:invalid");
    expect(await emote(a, "<img>")).toBe("emote:invalid");
  });

  it("rate-limits per user and refuses the unpaired", async () => {
    const { a, b } = await pair();
    expect(await emote(a, "wave")).toBeNull();
    expect(await emote(a, "wave")).toBe("emote:rate_limited");
    expect(await emote(b, "wave")).toBeNull();
    expect(await emote(await newUser(), "wave")).toBe("emote:not_paired");
  });
});

describe("realtime topics written only by the database", () => {
  const realtimeSend = (userId, topic, extension = "broadcast") =>
    db
      .transaction(async (tx) => {
        await tx.query("select set_config('realtime.topic', $1, true)", [topic]);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
        await tx.exec("set local role authenticated");
        await tx.query("insert into realtime.messages (topic, extension, private) values ($1, $2, true)", [topic, extension]);
      })
      .then(
        () => true,
        () => false,
      );

  it("clients cannot broadcast fake chat messages or emotes, but still stream presence", async () => {
    const { a, coupleId } = await pair();
    expect(await realtimeSend(a, `our-place:couple:${coupleId}:chat`)).toBe(false);
    expect(await realtimeSend(a, `our-place:couple:${coupleId}:emotes`)).toBe(false);
    expect(await realtimeSend(a, `our-place:couple:${coupleId}:notifications`)).toBe(false);
    expect(await realtimeSend(a, `our-place:couple:${coupleId}:presence`)).toBe(true);
    expect(await realtimeSend(a, `our-place:couple:${coupleId}:presence`, "presence")).toBe(true);
    expect(await realtimeSend(a, `our-place:couple:${coupleId}:voice`)).toBe(true); // direct-voice signaling
    const outsider = (await pair()).a;
    expect(await realtimeSend(outsider, `our-place:couple:${coupleId}:voice`)).toBe(false);
  });

  it("partners can receive their couple's chat and emote topics; others cannot", async () => {
    const { a, b, coupleId } = await pair();
    await send(a, "for b");
    const receive = (userId, channel) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('realtime.topic', $1, true)", [`our-place:couple:${coupleId}:${channel}`]);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
        await tx.exec("set local role authenticated");
        return (await tx.query("select id from realtime.messages")).rows.length > 0;
      });
    expect(await receive(b, "chat")).toBe(true);
    expect(await receive(coupleA.a, "chat")).toBe(false);
  });
});
