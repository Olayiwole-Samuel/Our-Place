// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/store/chatStore";
import { openCoupleChat } from "./chatService";
import { canReplyTo, isMissingReplySupport, missingReplies, quoteSnippet, resolveReply, toMessage } from "./messages";
import { SWIPE, swipeArmed, swipeAxis, swipeOffset } from "./swipe";
import { TYPING, createTypingGate, typingFrom } from "./typing";

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const COUPLE = "33333333-3333-4333-8333-333333333333";
let seq = 0;
const uuid = () => `bbbbbbbb-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const row = (over = {}) => ({ id: uuid(), sender_id: PARTNER, type: "text", content: "hi", client_id: null, reply_to: null, created_at: `2026-10-21T12:00:${String(seq % 60).padStart(2, "0")}.123456+00:00`, ...over });

describe("reply helpers", () => {
  it("reads reply_to from rows, ignoring junk and self-references", () => {
    const original = row();
    expect(toMessage(row({ reply_to: original.id })).replyTo).toBe(original.id);
    expect(toMessage(row()).replyTo).toBeNull();
    expect(toMessage(row({ reply_to: "not-a-uuid" })).replyTo).toBeNull();
    const self = row();
    expect(toMessage({ ...self, reply_to: self.id }).replyTo).toBeNull();
    // Rows from before the migration have no reply_to at all.
    const { reply_to: _ignored, ...legacy } = row();
    expect(toMessage(legacy).replyTo).toBeNull();
  });

  it("quotes one line, cut at a whole character", () => {
    expect(quoteSnippet("  see you\n\nat   8  ")).toBe("see you at 8");
    expect(quoteSnippet("x".repeat(200))).toHaveLength(90);
    expect(quoteSnippet("x".repeat(200)).endsWith("…")).toBe(true);
    const hearts = "❤️".repeat(60);
    expect(quoteSnippet(hearts, 7)).not.toMatch(/�/);
    expect(quoteSnippet("short", 90)).toBe("short");
  });

  it("only saved text messages can be answered", () => {
    expect(canReplyTo(toMessage(row()))).toBe(true);
    expect(canReplyTo({ id: "local:abc", type: "text", status: "sending" })).toBe(false);
    expect(canReplyTo({ ...toMessage(row()), status: "failed" })).toBe(false);
    expect(canReplyTo({ id: "notice:1", type: "system", status: "sent", local: true })).toBe(false);
    expect(canReplyTo(null)).toBe(false);
  });

  it("resolves a quote from the loaded window, then the fetched cache", () => {
    const original = toMessage(row({ content: "Dinner at 8?" }));
    const reply = toMessage(row({ sender_id: ME, reply_to: original.id }));
    const far = toMessage(row({ sender_id: ME, reply_to: "cccccccc-0000-4000-8000-000000000001" }));
    const byId = new Map([original, reply, far].map((message) => [message.id, message]));
    expect(resolveReply(original, byId)).toBeNull();
    expect(resolveReply(reply, byId)).toEqual({ id: original.id, state: "ready", senderId: PARTNER, snippet: "Dinner at 8?" });
    expect(resolveReply(far, byId)).toEqual({ id: far.replyTo, state: "loading" });
    expect(resolveReply(far, byId, { [far.replyTo]: null })).toEqual({ id: far.replyTo, state: "missing" });
    expect(missingReplies([original, reply, far], {})).toEqual([far.replyTo]);
    expect(missingReplies([original, reply, far], { [far.replyTo]: null })).toEqual([]);
  });

  it("recognises a database without the replies migration", () => {
    expect(isMissingReplySupport({ code: "42703", message: "column messages.reply_to does not exist" })).toBe(true);
    expect(isMissingReplySupport({ code: "PGRST202", message: "Could not find the function public.send_message(client_id, content, reply_to) in the schema cache" })).toBe(true);
    expect(isMissingReplySupport({ code: "42501", message: "permission denied for table messages" })).toBe(false);
    expect(isMissingReplySupport({ message: "chat:invalid_reply" })).toBe(false);
    expect(isMissingReplySupport(null)).toBe(false);
  });
});

describe("swipe feel", () => {
  it("locks to an axis only after a few pixels; vertical or leftward is never a reply", () => {
    expect(swipeAxis(4, 3)).toBeNull();
    expect(swipeAxis(14, 3)).toBe("x");
    expect(swipeAxis(3, 14)).toBe("none"); // scrolling
    expect(swipeAxis(12, 11)).toBe("none"); // diagonal: let the list scroll
    expect(swipeAxis(-20, 0)).toBe("none"); // leftward
  });

  it("follows the finger 1:1 up to the trigger, then resists, never past the cap", () => {
    expect(swipeOffset(-30)).toBe(0);
    expect(swipeOffset(20)).toBe(20);
    expect(swipeOffset(SWIPE.trigger)).toBe(SWIPE.trigger);
    expect(swipeOffset(SWIPE.trigger + 20)).toBeCloseTo(SWIPE.trigger + 20 * SWIPE.resistance);
    expect(swipeOffset(500)).toBe(SWIPE.cap);
    expect(SWIPE.cap).toBeLessThanOrEqual(72);
    expect(swipeArmed(swipeOffset(SWIPE.trigger - 1))).toBe(false);
    expect(swipeArmed(swipeOffset(SWIPE.trigger + 5))).toBe(true);
  });
});

describe("typing signals", () => {
  it("says 'typing' once, refreshes while typing continues, and 'stopped' once", () => {
    const gate = createTypingGate();
    expect(gate.input(true, 0)).toBe(true);
    expect(gate.input(true, 500)).toBeNull();
    expect(gate.input(true, TYPING.refreshMs + 1)).toBe(true);
    expect(gate.input(false, TYPING.refreshMs + 2)).toBe(false);
    expect(gate.input(false, TYPING.refreshMs + 3)).toBeNull();
    expect(gate.stop()).toBeNull();
    expect(gate.input(true, 10_000)).toBe(true);
  });

  it("treats anything but { on: true } as not typing", () => {
    expect(typingFrom({ on: true })).toBe(true);
    expect(typingFrom({ on: "yes" })).toBe(false);
    expect(typingFrom(null)).toBe(false);
  });
});

function service(over = {}) {
  return {
    loadPage: vi.fn(async () => ({ messages: [], hasOlder: false, replies: true })),
    loadByIds: vi.fn(async () => []),
    catchUp: vi.fn(async () => []),
    send: vi.fn(async (content, clientId, replyTo) => toMessage(row({ sender_id: ME, content, client_id: clientId, reply_to: replyTo }))),
    ...over,
  };
}

describe("chat store replies", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    window.localStorage.clear();
  });

  it("swipe → reply → send: the message carries reply_to and the composer quote clears", async () => {
    const original = toMessage(row({ content: "Movie tonight?" }));
    const svc = service({ loadPage: vi.fn(async () => ({ messages: [original], hasOlder: false, replies: true })) });
    await useChatStore.getState().attach(svc, { userId: ME, coupleId: COUPLE });
    expect(useChatStore.getState().startReply(original)).toBe(true);
    expect(useChatStore.getState().replyingTo.id).toBe(original.id);
    const sending = useChatStore.getState().sendMessage("Yes!");
    expect(useChatStore.getState().replyingTo).toBeNull();
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({ status: "sending", replyTo: original.id });
    await sending;
    expect(svc.send).toHaveBeenCalledWith("Yes!", expect.any(String), original.id);
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({ status: "sent", replyTo: original.id });
  });

  it("keeps the reply when the text is rejected, and cancels on request", async () => {
    const original = toMessage(row());
    await useChatStore.getState().attach(service({ loadPage: vi.fn(async () => ({ messages: [original], hasOlder: false, replies: true })) }), { userId: ME, coupleId: COUPLE });
    useChatStore.getState().startReply(original);
    expect(await useChatStore.getState().sendMessage("   ")).toBe("empty");
    expect(useChatStore.getState().replyingTo?.id).toBe(original.id);
    useChatStore.getState().cancelReply();
    expect(useChatStore.getState().replyingTo).toBeNull();
  });

  it("refuses to reply to pending messages", async () => {
    await useChatStore.getState().attach(service({ send: vi.fn(() => new Promise(() => {})) }), { userId: ME, coupleId: COUPLE });
    useChatStore.getState().sendMessage("still sending");
    const pending = useChatStore.getState().messages.at(-1);
    expect(useChatStore.getState().startReply(pending)).toBe(false);
  });

  it("before the migration: replies are off and messages send without reply_to", async () => {
    const original = toMessage(row());
    const svc = service({ loadPage: vi.fn(async () => ({ messages: [original], hasOlder: false, replies: false })) });
    await useChatStore.getState().attach(svc, { userId: ME, coupleId: COUPLE });
    expect(useChatStore.getState().replies).toBe(false);
    expect(useChatStore.getState().startReply(original)).toBe(false);
    await useChatStore.getState().sendMessage("plain");
    expect(svc.send).toHaveBeenCalledWith("plain", expect.any(String), null);
    expect(svc.loadByIds).not.toHaveBeenCalled();
  });

  it("fetches originals that are outside the loaded window, once", async () => {
    const farId = "cccccccc-0000-4000-8000-000000000002";
    const goneId = "cccccccc-0000-4000-8000-000000000003";
    const far = toMessage(row({ id: farId, content: "from last month" }));
    const replies = [toMessage(row({ reply_to: farId })), toMessage(row({ reply_to: goneId })), toMessage(row({ reply_to: farId }))];
    const svc = service({ loadPage: vi.fn(async () => ({ messages: replies, hasOlder: true, replies: true })), loadByIds: vi.fn(async () => [far]) });
    await useChatStore.getState().attach(svc, { userId: ME, coupleId: COUPLE });
    await vi.waitFor(() => expect(useChatStore.getState().quoted[farId]).toBeTruthy());
    expect(svc.loadByIds).toHaveBeenCalledTimes(1);
    expect(svc.loadByIds.mock.calls[0][0].sort()).toEqual([farId, goneId].sort());
    expect(useChatStore.getState().quoted[goneId]).toBeNull();
    useChatStore.getState().receive(toMessage(row({ reply_to: farId })));
    expect(svc.loadByIds).toHaveBeenCalledTimes(1); // cached
  });

  it("a reply whose original vanished fails clearly; Retry sends it without the quote", async () => {
    const original = toMessage(row());
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("chat:invalid_reply"), { code: "invalid_reply" }))
      .mockImplementation(async (content, clientId, replyTo) => toMessage(row({ sender_id: ME, content, client_id: clientId, reply_to: replyTo })));
    await useChatStore.getState().attach(service({ loadPage: vi.fn(async () => ({ messages: [original], hasOlder: false, replies: true })), send }), { userId: ME, coupleId: COUPLE });
    useChatStore.getState().startReply(original);
    await useChatStore.getState().sendMessage("answer");
    const failed = useChatStore.getState().messages.at(-1);
    expect(failed).toMatchObject({ status: "failed", error: "invalid_reply" });
    await useChatStore.getState().retry(failed.clientId);
    expect(send).toHaveBeenLastCalledWith("answer", failed.clientId, null);
    expect(useChatStore.getState().messages.at(-1).status).toBe("sent");
  });
});

describe("chat store typing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.getState().reset();
  });
  afterEach(() => vi.useRealTimers());

  it("tells the partner sparingly: start, refresh, stop on send / clear / idle", async () => {
    const sent = [];
    useChatStore.getState().bindTyping((on) => sent.push(on));
    await useChatStore.getState().attach(service(), { userId: ME, coupleId: COUPLE });
    const { noteTyping } = useChatStore.getState();
    noteTyping("h");
    noteTyping("he");
    noteTyping("hey");
    expect(sent).toEqual([true]);
    vi.advanceTimersByTime(TYPING.refreshMs);
    noteTyping("hey y");
    expect(sent).toEqual([true, true]);
    noteTyping("");
    expect(sent).toEqual([true, true, false]);
    noteTyping("again");
    vi.advanceTimersByTime(TYPING.idleMs);
    expect(sent).toEqual([true, true, false, true, false]); // idle → stopped
    noteTyping("sending this");
    await useChatStore.getState().sendMessage("sending this");
    expect(sent.at(-1)).toBe(false);
    noteTyping("closing");
    useChatStore.getState().setOpen(false);
    expect(sent.at(-1)).toBe(false);
  });

  it("shows the partner typing until they stop, send, or go quiet", async () => {
    await useChatStore.getState().attach(service(), { userId: ME, coupleId: COUPLE });
    const { setPartnerTyping } = useChatStore.getState();
    setPartnerTyping(true);
    expect(useChatStore.getState().partnerTyping).toBe(true);
    setPartnerTyping(false);
    expect(useChatStore.getState().partnerTyping).toBe(false);
    setPartnerTyping(true);
    useChatStore.getState().receive(toMessage(row({ content: "here!" })));
    expect(useChatStore.getState().partnerTyping).toBe(false);
    setPartnerTyping(true);
    vi.advanceTimersByTime(TYPING.expireMs - 1);
    setPartnerTyping(true); // a refresh keeps it on
    vi.advanceTimersByTime(TYPING.expireMs - 1);
    expect(useChatStore.getState().partnerTyping).toBe(true);
    vi.advanceTimersByTime(1);
    expect(useChatStore.getState().partnerTyping).toBe(false); // a lost "stopped" never sticks
  });

  it("our own messages (from another tab) don't clear the partner's indicator", async () => {
    await useChatStore.getState().attach(service(), { userId: ME, coupleId: COUPLE });
    useChatStore.getState().setPartnerTyping(true);
    useChatStore.getState().receive(toMessage(row({ sender_id: ME })));
    expect(useChatStore.getState().partnerTyping).toBe(true);
  });
});

/** A Supabase stand-in whose messages table may or may not have reply_to yet. */
function fakeSupabase({ hasReplyColumn }) {
  const selects = [];
  const rpcs = [];
  const query = (columns) => {
    selects.push(columns);
    const missing = !hasReplyColumn && columns.includes("reply_to");
    const result = missing ? { data: null, error: { code: "42703", message: "column messages.reply_to does not exist" } } : { data: [row({ content: "hello" })], error: null };
    const builder = { order: () => builder, limit: () => builder, or: () => builder, in: () => builder, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return builder;
  };
  const channel = { on: () => channel, subscribe: () => channel, send: vi.fn() };
  return {
    selects,
    rpcs,
    supabase: {
      from: () => ({ select: query }),
      rpc: vi.fn(async (name, args) => {
        rpcs.push(args);
        return { data: row({ sender_id: ME, content: args.content, client_id: args.client_id, reply_to: args.reply_to ?? null }), error: null };
      }),
      channel: () => channel,
      removeChannel: vi.fn(async () => {}),
      realtime: { setAuth: vi.fn(async () => {}) },
    },
  };
}

const handlers = () => ({ onConnection: vi.fn(), onMessage: vi.fn() });

describe("chat service and the replies migration", () => {
  it("before the migration: notices the missing column, reads without it, sends plain", async () => {
    const fake = fakeSupabase({ hasReplyColumn: false });
    const chat = openCoupleChat({ supabase: fake.supabase, coupleId: COUPLE, handlers: handlers() });
    const page = await chat.loadPage();
    expect(page.replies).toBe(false);
    expect(page.messages).toHaveLength(1);
    expect(fake.selects).toHaveLength(2);
    expect(fake.selects[1]).not.toContain("reply_to");
    await chat.send("hi", "dddddddd-0000-4000-8000-000000000001", "eeeeeeee-0000-4000-8000-000000000001");
    expect(fake.rpcs.at(-1)).toEqual({ content: "hi", client_id: "dddddddd-0000-4000-8000-000000000001" });
    expect(await chat.loadByIds(["eeeeeeee-0000-4000-8000-000000000001"])).toEqual([]);
    await chat.close();
  });

  it("after the migration: reads reply_to and sends it only for replies", async () => {
    const fake = fakeSupabase({ hasReplyColumn: true });
    const chat = openCoupleChat({ supabase: fake.supabase, coupleId: COUPLE, handlers: handlers() });
    expect((await chat.loadPage()).replies).toBe(true);
    expect(fake.selects[0]).toContain("reply_to");
    const replyTo = "eeeeeeee-0000-4000-8000-000000000002";
    const saved = await chat.send("yes", "dddddddd-0000-4000-8000-000000000002", replyTo);
    expect(fake.rpcs.at(-1)).toEqual({ content: "yes", client_id: "dddddddd-0000-4000-8000-000000000002", reply_to: replyTo });
    expect(saved.replyTo).toBe(replyTo);
    await chat.send("plain", "dddddddd-0000-4000-8000-000000000003");
    expect(fake.rpcs.at(-1)).not.toHaveProperty("reply_to");
    await chat.close();
  });
});
