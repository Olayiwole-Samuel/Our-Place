// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Count renders of the 3D world (the real one needs WebGL; the boundary is what's tested).
const worldRenders = vi.fn();
vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicStub() {
      worldRenders();
      return null;
    },
}));

const { WorldStage } = await import("./WorldStage");
const { useWorldStore } = await import("@/store/worldStore");
const { useChatStore } = await import("@/store/chatStore");
const { useVoiceStore } = await import("@/store/voiceStore");
const { useGameStore } = await import("@/store/gameStore");

describe("HUD state never re-renders the 3D world", () => {
  it("lobby re-renders with the same inputs don't reach the scene", () => {
    const runtime = {};
    const partner = { id: "p" };
    const mine = { config: {} };
    const theirs = { config: {} };
    function LobbyLike({ hudState }) {
      // The lobby re-renders on HUD state (connection, partner, chat, voice, game panel)…
      return (
        <>
          <span>{hudState}</span>
          <WorldStage runtime={runtime} partner={partner} myCharacter={mine} partnerCharacter={theirs} />
        </>
      );
    }
    const { rerender } = render(<LobbyLike hudState="a" />);
    const initial = worldRenders.mock.calls.length;
    rerender(<LobbyLike hudState="b" />);
    act(() => {
      useWorldStore.getState().setConnection("reconnecting");
      useWorldStore.getState().setInGame(true);
      useChatStore.getState().setOpen(true);
      useVoiceStore.setState({ micEnabled: true, partner: { connected: true, muted: false, speaking: true } });
      useGameStore.getState().openCategory("board_strategy"); // game menu drawer
      useGameStore.getState().closeDrawer();
    });
    // …but the world only renders again when its own inputs change.
    expect(worldRenders.mock.calls.length).toBe(initial);
  });
});
