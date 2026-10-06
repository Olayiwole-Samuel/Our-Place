// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/store/chatStore";
import { compareMessages, mergeMessages, toMessage, validateMessage } from "./messages";

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const COUPLE = "33333333-3333-4333-8333-333333333333";
let seq = 0;
const uuid = () => `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const row = (over = {}) => ({ id: uuid(), sender_id: PARTNER, type: "text", content: "hi", client_id: null, created_at: `2026-10-04T12:00:${String(seq % 60).padStart(2, "0")}.123456+00:00`, ...over });

describe("message rules", () => {
  it("validates like the database", () => {
    expect(validateMessage("  hello \n")).toEqual({ ok: true, text: "hello" });
    expect(validateMessage(" \n\t ").ok).toBe(false);
    expect(validateMessage("x".repeat(2001))).toEqual({ ok: false, reason: "too_long" });
    expect(validateMessage(42)).toEqual({ ok: false, reason: "empty" });
    expect(validateMessage("bell\u0007").text).toBe("bell");
  });

  it("rejects malformed realtime payloads", () => {
    expect(toMessage(null)).toBeNull();
    expect(toMessage({ ...row(), id: "not-a-uuid" })).toBeNull();
    expect(toMessage({ ...row(), type: "html" })).toBeNull();
    expect(toMessage({ ...row(), content: { evil: true } })).toBeNull();
    expect(toMessage({ ...row(), created_at: "yesterday" })).toBeNull();
    // Content is kept as plain text — rendering escapes it.
    expect(toMessage(row({ content: "<img src=x onerror=alert(1)>" })).content).toBe("<img src=x onerror=alert(1)>");
  });

  it("orders by database time to the microsecond, not arrival order", () => {
    const a = toMessage(row({ created_at: "2026-10-04T12:00:00.123401+00:00" }));
    const b = toMessage(row({ created_at: "2026-10-04T12:00:00.1235+00:00" }));
    const c = toMessage(row({ created_at: "2026-10-04T12:00:01+00:00" }));
    expect([c, b, a].sort(compareMessages)).toEqual([a, b, c]);
    expect(mergeMessages([], [c, a, b]).map((m) => m.id)).toEqual([a.id, b.id, c.id]);
  });

  it("never shows a message twice (id is canonical; confirmed replaces optimistic)", () => {
    const saved = toMessage(row({ sender_id: ME, client_id: "c1" }));
    const pending = { ...saved, id: "local:c1", status: "sending" };
    expect(mergeMessages([pending], [saved, saved])).toEqual([saved]);
  });
});

function fakeService() {
  return {
    loadPage: vi.fn(async () => ({ messages: [], hasOlder: false })),
    catchUp: vi.fn(async () => []),
    send: vi.fn(),
  };
}

describe("chat store", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    window.localStorage.clear();
  });

  it("loads the latest page and counts unseen partner messages as unread", async () => {
    const service = fakeService();
    const history = [toMessage(row()), toMessage(row({ sender_id: ME })), toMessage(row())];
    service.loadPage.mockResolvedValue({ messages: history, hasOlder: true });
    await useChatStore.getState().attach(service, { userId: ME, coupleId: COUPLE });
    expect(useChatStore.getState()).toMatchObject({ status: "ready", hasOlder: true, unread: 2 });
    useChatStore.getState().setOpen(true);
    expect(useChatStore.getState().unread).toBe(0);
    // Seen state survives a reload.
    useChatStore.getState().reset();
    await useChatStore.getState().attach(service, { userId: ME, coupleId: COUPLE });
    expect(useChatStore.getState().unread).toBe(0);
  });

  it("optimistic send → confirmed row, deduplicated whether realtime arrives before or after the RPC", async () => {
    const service = fakeService();
    await useChatStore.getState().attach(service, { userId: ME, coupleId: COUPLE });
    let confirm;
    service.send.mockImplementation(() => new Promise((resolve) => (confirm = resolve)));
    const sending = useChatStore.getState().sendMessage("  I'm here ");
    await Promise.resolve();
    expect(useChatStore.getState().messages).toMatchObject([{ content: "I'm here", status: "sending" }]);
    const clientId = service.send.mock.calls[0][1];
    // Realtime delivers the saved row first…
    const saved = toMessage(row({ sender_id: ME, content: "I'm here", client_id: clientId }));
    useChatStore.getState().receive(saved);
    // …then the RPC resolves with (another copy of) the same row.
    confirm({ ...saved });
    await sending;
    const messages = useChatStore.getState().messages;
    expect(messages.filter((m) => m.content === "I'm here")).toHaveLength(1);
    expect(messages.every((m) => m.status === "sent")).toBe(true);
  });

  it("a failed send is marked failed (never shown as sent) and can be retried", async () => {
    const service = fakeService();
    await useChatStore.getState().attach(service, { userId: ME, coupleId: COUPLE });
    service.send.mockRejectedValueOnce(Object.assign(new Error("Failed to fetch"), { code: "network" }));
    await useChatStore.getState().sendMessage("hello?");
    const [failed] = useChatStore.getState().messages;
    expect(failed).toMatchObject({ status: "failed", error: "network" });
    service.send.mockImplementation(async (content, clientId) => toMessage(row({ sender_id: ME, content, client_id: clientId })));
    await useChatStore.getState().retry(failed.clientId);
    expect(useChatStore.getState().messages).toMatchObject([{ content: "hello?", status: "sent" }]);
    expect(service.send.mock.calls[1][1]).toBe(failed.clientId); // same client id → idempotent server-side
  });

  it("validates before sending and paces bursts", async () => {
    const service = fakeService();
    service.send.mockImplementation(async (content, clientId) => toMessage(row({ sender_id: ME, content, client_id: clientId })));
    await useChatStore.getState().attach(service, { userId: ME, coupleId: COUPLE });
    expect(await useChatStore.getState().sendMessage("   ")).toBe("empty");
    for (let i = 0; i < 8; i += 1) expect(await useChatStore.getState().sendMessage(`m${i}`)).toBeNull();
    expect(await useChatStore.getState().sendMessage("too fast")).toBe("rate_limited");
    expect(service.send).toHaveBeenCalledTimes(8);
  });

  it("partner messages while closed raise unread; duplicates don't", async () => {
    await useChatStore.getState().attach(fakeService(), { userId: ME, coupleId: COUPLE });
    const message = toMessage(row());
    expect(useChatStore.getState().receive(message)).toHaveLength(1);
    expect(useChatStore.getState().receive(message)).toHaveLength(0);
    useChatStore.getState().receive(toMessage(row({ sender_id: ME })));
    expect(useChatStore.getState().unread).toBe(1);
  });

  it("loads older pages above the window and catches up after reconnecting", async () => {
    const service = fakeService();
    const latest = toMessage(row({ created_at: "2026-10-04T12:00:10+00:00" }));
    const older = toMessage(row({ created_at: "2026-10-04T11:00:00+00:00" }));
    const missed = toMessage(row({ created_at: "2026-10-04T12:05:00+00:00" }));
    service.loadPage.mockResolvedValueOnce({ messages: [latest], hasOlder: true }).mockResolvedValueOnce({ messages: [older], hasOlder: false });
    service.catchUp.mockResolvedValue([missed]);
    await useChatStore.getState().attach(service, { userId: ME, coupleId: COUPLE });
    await useChatStore.getState().loadOlder();
    expect(service.loadPage).toHaveBeenLastCalledWith(latest);
    await useChatStore.getState().catchUp();
    expect(service.catchUp).toHaveBeenCalledWith(latest);
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual([older.id, latest.id, missed.id]);
    expect(useChatStore.getState().hasOlder).toBe(false);
  });

  it("presence notices are local system lines, never used as paging or seen cursors", async () => {
    const service = fakeService();
    const latest = toMessage(row());
    service.loadPage.mockResolvedValue({ messages: [latest], hasOlder: false });
    await useChatStore.getState().attach(service, { userId: ME, coupleId: COUPLE });
    useChatStore.getState().addNotice("❤️ Sam is here");
    await useChatStore.getState().catchUp();
    expect(service.catchUp).toHaveBeenCalledWith(latest);
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({ type: "system", local: true });
  });
});
