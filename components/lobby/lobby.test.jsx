// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { roomInteractables, livingRoom } from "@/lib/world/rooms/livingRoom";
import { createWorldRuntime } from "@/lib/world/runtime";
import { CoupleStoreContext, createCoupleStore } from "@/store/coupleStore";
import { useWorldStore } from "@/store/worldStore";
import { InteractPrompt } from "./InteractionUI";
import { Joystick } from "./Joystick";
import { ConnectionStatus, PartnerStatus } from "./PresenceStatus";
import { useWorldControls } from "./useWorldControls";

const interactable = (type) => roomInteractables(livingRoom).find((item) => item.type === type);
const key = (code, target = window) => act(() => target.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true })));

function Controls({ runtime }) {
  useWorldControls(runtime);
  return <input aria-label="chat draft" />;
}

beforeEach(() => act(() => useWorldStore.getState().reset()));

describe("world controls", () => {
  it("E on the couch sits you in your own seat", () => {
    const runtime = createWorldRuntime(livingRoom, 2);
    render(<Controls runtime={runtime} />);
    act(() => useWorldStore.getState().setInteractionTarget(interactable("couch")));
    key("KeyE");
    expect(runtime.localPose).toMatchObject({ ...livingRoom.objects.find((o) => o.type === "couch").seats[2], anim: "sit" });
    expect(useWorldStore.getState().seated).toBe(true);
  });

  it("E on an object without a feature yet opens its info card; Esc closes it", () => {
    const runtime = createWorldRuntime(livingRoom, 1);
    render(<Controls runtime={runtime} />);
    act(() => useWorldStore.getState().setInteractionTarget(interactable("photoWall")));
    key("KeyE");
    expect(useWorldStore.getState().activeInteraction).toBe("photo_wall");
    key("Escape");
    expect(useWorldStore.getState().activeInteraction).toBeNull();
  });

  it("Esc works even when focus is on the card's close button", () => {
    const runtime = createWorldRuntime(livingRoom, 1);
    render(
      <>
        <Controls runtime={runtime} />
        <button type="button">Close</button>
      </>,
    );
    act(() => useWorldStore.getState().openInteraction("photo_wall"));
    key("Escape", screen.getByRole("button", { name: "Close" }));
    expect(useWorldStore.getState().activeInteraction).toBeNull();
  });

  it("movement keys drive input, but not while typing in a field", () => {
    const runtime = createWorldRuntime(livingRoom, 1);
    render(<Controls runtime={runtime} />);
    key("KeyW", screen.getByLabelText("chat draft"));
    expect(runtime.input.getMove()).toEqual({ x: 0, y: 0 });
    key("KeyW");
    expect(runtime.input.getMove().y).toBe(1);
    act(() => window.dispatchEvent(new Event("blur")));
    expect(runtime.input.getMove()).toEqual({ x: 0, y: 0 }); // no stuck keys
  });

  it("does nothing when nothing is in reach", () => {
    const runtime = createWorldRuntime(livingRoom, 1);
    render(<Controls runtime={runtime} />);
    key("KeyE");
    expect(useWorldStore.getState().activeInteraction).toBeNull();
    expect(runtime.localPose.anim).toBe("idle");
  });
});

describe("HUD", () => {
  it("shows the interact button only when something is in reach, labelled for screen readers", () => {
    render(<InteractPrompt onInteract={() => {}} touch />);
    expect(screen.queryByRole("button")).toBeNull();
    act(() => useWorldStore.getState().setInteractionTarget(interactable("couch")));
    expect(screen.getByRole("button", { name: "Sit: Couch" })).toBeTruthy();
  });

  it("joystick writes a forward vector and re-centres on release", () => {
    const runtime = createWorldRuntime(livingRoom, 1);
    render(<Joystick input={runtime.input} />);
    const stick = screen.getByRole("application", { name: /joystick/i });
    stick.getBoundingClientRect = () => ({ left: 0, top: 0, width: 132, height: 132 });
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 66, clientY: 0 }); // straight up = forward
    expect(runtime.input.getMove().y).toBeCloseTo(1);
    fireEvent.pointerUp(stick, { pointerId: 1 });
    expect(runtime.input.getMove()).toEqual({ x: 0, y: 0 });
  });

  describe("partner status", () => {
    const partner = { id: "p", displayName: "Sam Okafor", avatarUrl: null, avatarThumbnail: null };
    const renderStatus = () =>
      render(
        <CoupleStoreContext.Provider
          value={createCoupleStore({ status: "paired", me: { ...partner, id: "me" }, partner, couple: { id: "c", pairedAt: "x", mySlot: 1 } })}
        >
          <PartnerStatus />
          <ConnectionStatus />
        </CoupleStoreContext.Provider>,
      );

    it("never claims the partner is here before Realtime confirms it", () => {
      renderStatus();
      expect(screen.getByText("Checking…")).toBeTruthy();
      expect(screen.queryByText("Here with you")).toBeNull();
    });

    it("describes each state in words, not colour alone", () => {
      renderStatus();
      act(() => {
        useWorldStore.getState().setConnection("live");
        useWorldStore.getState().dispatchPartner({ type: "sync", partnerPresent: true });
      });
      expect(screen.getByText("Here with you")).toBeTruthy();
      expect(screen.getByLabelText("Connection: Live")).toBeTruthy();
      act(() => useWorldStore.getState().dispatchPartner({ type: "sync", partnerPresent: false }));
      expect(screen.getByText("Reconnecting…", { selector: "span" })).toBeTruthy();
      act(() => useWorldStore.getState().dispatchPartner({ type: "grace_expired" }));
      expect(screen.getByText("Not here yet")).toBeTruthy();
    });

    it("losing our own connection makes the partner unknown, not online", () => {
      renderStatus();
      act(() => {
        useWorldStore.getState().setConnection("live");
        useWorldStore.getState().dispatchPartner({ type: "sync", partnerPresent: true });
        useWorldStore.getState().setConnection("closed");
      });
      expect(screen.queryByText("Here with you")).toBeNull();
      expect(screen.getByText("Can't check right now")).toBeTruthy();
      expect(screen.getByLabelText("Connection: Offline")).toBeTruthy();
    });
  });
});
