// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toMessage } from "@/lib/chat/messages";
import { livingRoom } from "@/lib/world/rooms/livingRoom";
import { createWorldRuntime } from "@/lib/world/runtime";
import { useChatStore } from "@/store/chatStore";
import { useVoiceStore } from "@/store/voiceStore";
import { useWorldStore } from "@/store/worldStore";
import { useCoupleComms } from "../useCoupleComms";
import { CommsDock } from "./CommsDock";

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const COUPLE = "33333333-3333-4333-8333-333333333333";
let n = 0;
const row = (over = {}) => ({ id: `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`, sender_id: PARTNER, type: "text", content: "hey", client_id: null, created_at: new Date().toISOString(), ...over });

function service() {
  return {
    loadPage: vi.fn(async () => ({ messages: [], hasOlder: false })),
    catchUp: vi.fn(async () => []),
    send: vi.fn(async (content, clientId) => toMessage(row({ sender_id: ME, content, client_id: clientId }))),
  };
}

beforeEach(async () => {
  act(() => {
    useChatStore.getState().reset();
    useWorldStore.getState().reset();
    useVoiceStore.setState({ status: "connected", micEnabled: false, partner: { connected: false, muted: true, speaking: false } });
  });
  window.localStorage.clear();
  Element.prototype.scrollTo = function scrollTo() {};
  await act(() => useChatStore.getState().attach(service(), { userId: ME, coupleId: COUPLE }));
  act(() => useChatStore.getState().setConnection("live"));
});

const dock = (onEmote = vi.fn(() => true)) => {
  const runtime = createWorldRuntime(livingRoom, 1);
  render(<CommsDock meId={ME} partnerName="Sam" runtime={runtime} onEmote={onEmote} />);
  return { onEmote, runtime };
};

describe("communication HUD", () => {
  it("has labelled chat, mic and emote controls (mic off by default)", () => {
    dock();
    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open emotes" })).toBeTruthy();
    const mic = screen.getByRole("button", { name: "Enable microphone" });
    expect(mic.getAttribute("aria-pressed")).toBe("false");
  });

  it("emotes are two taps: open the tray, tap one", () => {
    const { onEmote } = dock();
    fireEvent.click(screen.getByRole("button", { name: "Open emotes" }));
    const tray = screen.getByRole("toolbar", { name: "Emotes" });
    const names = [...tray.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Wave", "Laugh", "Cry", "Kiss", "Dance", "Angry", "Heart"]);
    fireEvent.click(screen.getByRole("button", { name: "Heart" }));
    expect(onEmote).toHaveBeenCalledWith("heart");
    fireEvent.keyDown(tray, { key: "1" });
    expect(onEmote).toHaveBeenLastCalledWith("wave");
  });

  it("opens chat in the world, sends with Enter and renders text — never HTML", async () => {
    dock();
    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    const input = screen.getByLabelText("Message Sam");
    fireEvent.change(input, { target: { value: "<img src=x onerror=alert(1)>" } });
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    const log = screen.getByRole("log");
    expect(log.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(log.querySelector("img")).toBeNull();
    expect(input.value).toBe("");
  });

  it("shows unread partner messages on the closed chat button, with a short preview", () => {
    dock();
    act(() => {
      useChatStore.getState().receive(toMessage(row({ content: "Come sit with me" })));
    });
    expect(screen.getByRole("button", { name: "Open chat, 1 unread" })).toBeTruthy();
    expect(screen.getByText("Come sit with me")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open chat, 1 unread" }));
    expect(useChatStore.getState().unread).toBe(0);
  });

  it("Enter opens chat from the world; Escape closes it", () => {
    dock();
    act(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    const input = screen.getByLabelText("Message Sam");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(useChatStore.getState().open).toBe(false);
  });

  it("failed messages say so and offer Retry", async () => {
    dock();
    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    act(() => useChatStore.setState({ messages: [{ id: "local:x", clientId: "x", senderId: ME, type: "text", content: "lost", createdAt: Date.now(), micros: Date.now() * 1000, status: "failed", error: "network" }] }));
    expect(screen.getByRole("alert").textContent).toContain("Message failed to send");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("emote triggering", () => {
  it("plays on the local character immediately (even offline) with a cooldown", () => {
    const runtime = createWorldRuntime(livingRoom, 1);
    const { result } = renderHook(() => useCoupleComms({ runtime, coupleId: COUPLE, userId: ME, partnerId: PARTNER }));
    expect(result.current.triggerEmote("wave")).toBe(true);
    expect(runtime.emotes.local).toMatchObject({ name: "wave" });
    expect(result.current.triggerEmote("heart")).toBe(false); // too soon
    expect(runtime.emotes.local.name).toBe("wave");
  });
});
