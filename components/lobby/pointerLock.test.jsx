// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/store/chatStore";
import { useWorldStore } from "@/store/worldStore";
import { useWorldControls } from "./useWorldControls";

const runtime = () => ({ camera: { yaw: 0 }, input: { pressKey: vi.fn(), releaseKey: vi.fn(), releaseAll: vi.fn() } });
const key = (type, k) => act(() => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true })));

function pointer({ fine }) {
  window.matchMedia = vi.fn((query) => ({ matches: query === "(pointer: fine)" ? fine : !fine, addEventListener() {}, removeEventListener() {} }));
}

describe("Ctrl cursor lock (desktop)", () => {
  let lockedElement;
  beforeEach(() => {
    lockedElement = null;
    Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => lockedElement });
    document.body.requestPointerLock = vi.fn(() => {
      lockedElement = document.body;
      document.dispatchEvent(new Event("pointerlockchange"));
    });
    document.exitPointerLock = vi.fn(() => {
      lockedElement = null;
      document.dispatchEvent(new Event("pointerlockchange"));
    });
    useWorldStore.getState().reset();
    useChatStore.getState().setOpen(false);
  });
  afterEach(() => {
    delete document.body.requestPointerLock;
  });

  it("a lone Ctrl tap locks the cursor, the mouse turns the camera, Ctrl again releases it", () => {
    pointer({ fine: true });
    const world = runtime();
    renderHook(() => useWorldControls(world));
    key("keydown", "Control");
    key("keyup", "Control");
    expect(document.body.requestPointerLock).toHaveBeenCalled();
    expect(useWorldStore.getState().lookLocked).toBe(true);
    act(() => {
      const move = new MouseEvent("mousemove");
      Object.defineProperty(move, "movementX", { value: 100 });
      document.dispatchEvent(move);
    });
    expect(world.camera.yaw).toBeLessThan(0);
    key("keydown", "Control");
    key("keyup", "Control");
    expect(document.exitPointerLock).toHaveBeenCalled();
    expect(useWorldStore.getState().lookLocked).toBe(false);
  });

  it("Ctrl used in a shortcut (Ctrl+C) doesn't lock", () => {
    pointer({ fine: true });
    renderHook(() => useWorldControls(runtime()));
    key("keydown", "Control");
    key("keydown", "c");
    key("keyup", "Control");
    expect(document.body.requestPointerLock).not.toHaveBeenCalled();
  });

  it("never locks on touch screens, or while a game is open", () => {
    pointer({ fine: false });
    const { unmount } = renderHook(() => useWorldControls(runtime()));
    key("keydown", "Control");
    key("keyup", "Control");
    expect(document.body.requestPointerLock).not.toHaveBeenCalled();
    unmount();

    pointer({ fine: true });
    useWorldStore.getState().setInGame(true);
    renderHook(() => useWorldControls(runtime()));
    key("keydown", "Control");
    key("keyup", "Control");
    expect(document.body.requestPointerLock).not.toHaveBeenCalled();
  });
});
