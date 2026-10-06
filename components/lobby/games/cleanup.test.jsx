// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const close = vi.fn(async () => {});
const opened = vi.fn();
vi.mock("@/lib/config/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/game/client", async (importOriginal) => ({
  ...(await importOriginal()),
  openCoupleGames: (options) => {
    opened(options);
    return { close };
  },
}));

const { useCoupleGames } = await import("./useCoupleGames");
const { GameMenu } = await import("./GameMenu");
const { useGameStore } = await import("@/store/gameStore");

afterEach(() => vi.unstubAllGlobals());

describe("game cleanup", () => {
  it("one games channel per room visit; leaving closes it and clears game state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ session: null, view: null }))));
    const { unmount, rerender } = renderHook((props) => useCoupleGames(props), { initialProps: { coupleId: "c1", userId: "u1" } });
    await act(async () => {});
    rerender({ coupleId: "c1", userId: "u1" }); // re-renders never open a second channel
    await act(async () => {});
    expect(opened).toHaveBeenCalledTimes(1);
    act(() => useGameStore.getState().openCategory("puzzle"));
    unmount();
    expect(close).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState()).toMatchObject({ drawer: null, session: null, view: null });
  });

  it("closing the drawer removes its keyboard listener", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    render(<GameMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Puzzle" }));
    act(() => useGameStore.getState().closeDrawer());
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    remove.mockRestore();
  });
});
