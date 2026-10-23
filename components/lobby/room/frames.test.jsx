// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { framePhotos } from "@/lib/room/frames";
import { useRoomStore } from "@/store/roomStore";
import { FramesPanel } from "./FramesPanel";

const memory = (id) => ({ id, url: `https://photos.example/${id}.webp`, caption: `Photo ${id}` });
const memories = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"].map(memory);

describe("picture frames", () => {
  it("shows your chosen photo, else your newest — skipping the living room's five when there are enough", () => {
    const photos = framePhotos({ hall_art_left_1: "m2" }, memories);
    expect(photos.hall_art_left_1).toEqual({ memory: memories[1], chosen: true });
    expect(photos.hall_art_left_0.chosen).toBe(false);
    expect(photos.hall_art_left_0.memory.id).toBe("m7"); // the 6th unchosen photo (m2 is taken)
    expect(new Set(Object.values(photos).map((p) => p.memory.id)).size).toBe(6); // no repeats across the walls
    expect(framePhotos({}, []).hall_art_right_2).toEqual({ memory: null, chosen: false });
  });

  describe("choosing", () => {
    let setFrame;
    beforeEach(() => {
      setFrame = vi.fn(async () => null);
      useRoomStore.setState({ preview: true, panelTarget: "hall_art_left", frames: {}, memories, setFrame, openPanel: vi.fn() });
    });

    it("hangs the photo you tap in the frame you picked, then moves to the next frame", async () => {
      render(<FramesPanel />);
      fireEvent.click(screen.getByRole("button", { name: /Frame 2/ }));
      fireEvent.click(screen.getByRole("button", { name: "Hang Photo m4 here" }));
      await vi.waitFor(() => expect(setFrame).toHaveBeenCalledWith("hall_art_left_1", "m4"));
      await vi.waitFor(() => expect(screen.getByRole("button", { name: /Frame 3/ }).getAttribute("aria-pressed")).toBe("true"));
    });

    it("can go back to newest photos, and sends you to Memories when there are none", async () => {
      useRoomStore.setState({ frames: { hall_art_left_0: "m3" } });
      const { unmount } = render(<FramesPanel />);
      fireEvent.click(screen.getByRole("button", { name: /Back to newest photos/ }));
      await vi.waitFor(() => expect(setFrame).toHaveBeenCalledWith("hall_art_left_0", null));
      unmount();
      useRoomStore.setState({ memories: [] });
      render(<FramesPanel />);
      fireEvent.click(screen.getByRole("button", { name: "Add photos" }));
      expect(useRoomStore.getState().openPanel).toHaveBeenCalledWith("memories");
    });
  });
});
