"use client";

import { useCallback, useEffect, useRef } from "react";
import { floorPoint, thingAt } from "@/lib/room/floorPick";
import { useDecorStore } from "@/store/decorStore";
import { useRoomStore } from "@/store/roomStore";
import { isTypingTarget } from "@/lib/world/input";
import { useChatStore } from "@/store/chatStore";
import { useWorldStore } from "@/store/worldStore";
import { INTERACTION_HANDLERS } from "./interactionHandlers";

const LOOK_SENSITIVITY = 0.006; // radians per pixel dragged
const LOCKED_SENSITIVITY = 0.0035; // radians per pixel of mouse movement while the cursor is locked

/**
 * Desktop and touch controls for the world:
 *   WASD / arrows → move      drag anywhere on the world → look around
 *   E or Enter → interact     Esc → close an info card
 *   Ctrl (desktop, tapped on its own) → lock the cursor: moving the mouse turns
 *   the camera without dragging; Ctrl or Esc again unlocks it
 * Returns `interact()` (for the touch Interact button) and pointer handlers to
 * spread onto the world container.
 */
export function useWorldControls(runtime) {
  const interact = useCallback(() => {
    const world = useWorldStore.getState();
    const target = world.interactionTarget;
    if (!target) return;
    const handler = INTERACTION_HANDLERS[target.type];
    if (!handler) return;
    if (handler.kind === "action") {
      handler.run({ runtime, world });
      world.setInteractionTarget(null);
    } else {
      world.openInteraction(target.id);
    }
  }, [runtime]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (useWorldStore.getState().inGame) return; // a game is open: keys belong to it
      if (event.code === "Escape") {
        useWorldStore.getState().closeInteraction();
        return;
      }
      if (event.code === "KeyE" || (event.code === "Enter" && event.target === document.body)) {
        if (!event.repeat) interact();
        return;
      }
      runtime.input.pressKey(event.code);
      if (event.code.startsWith("Arrow")) event.preventDefault(); // don't scroll
    };
    const onKeyUp = (event) => runtime.input.releaseKey(event.code);
    const onBlur = () => runtime.input.releaseAll(); // no stuck keys after alt-tab

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [runtime, interact]);

  // Cursor lock (desktop only): a lone Ctrl tap toggles it. Ctrl used in a
  // shortcut (Ctrl+C…) doesn't count, and it's never offered on touch screens.
  useEffect(() => {
    const finePointer = window.matchMedia?.("(pointer: fine)").matches && !window.matchMedia?.("(pointer: coarse)").matches;
    if (!finePointer || typeof document.body.requestPointerLock !== "function") return undefined;
    let ctrlAlone = false;
    const locked = () => Boolean(document.pointerLockElement);
    const unlock = () => locked() && document.exitPointerLock();
    const onKeyDown = (event) => {
      ctrlAlone = event.key === "Control" && !event.repeat;
    };
    const onKeyUp = (event) => {
      if (event.key !== "Control" || !ctrlAlone) return;
      ctrlAlone = false;
      if (locked()) {
        unlock();
        return;
      }
      if (isTypingTarget(document.activeElement) || useWorldStore.getState().inGame || useChatStore.getState().open) return;
      try {
        const request = document.body.requestPointerLock();
        request?.catch?.(() => {}); // refused (e.g. right after an Esc): nothing to do
      } catch {
        // pointer lock unavailable
      }
    };
    const onLockChange = () => useWorldStore.getState().setLookLocked(locked());
    const onMouseMove = (event) => {
      if (locked()) runtime.camera.yaw -= event.movementX * LOCKED_SENSITIVITY;
    };
    // A game or the chat needs the cursor back.
    const stopWatching = [useWorldStore.subscribe((state) => state.inGame && unlock()), useChatStore.subscribe((state) => state.open && unlock())];
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      stopWatching.forEach((stop) => stop());
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      unlock();
      useWorldStore.getState().setLookLocked(false);
    };
  }, [runtime]);

  // Drag to look (mouse or a finger on the world, not on HUD controls).
  // Decorate mode: a tap / drag on the floor moves what you're placing, and a
  // tap on something placed picks it up; dragging empty floor still looks around.
  const drag = useRef(null);
  const lookHandlers = {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      const decor = useDecorStore.getState();
      if (decor.active) {
        const point = floorPoint(runtime.view, event.clientX, event.clientY);
        const thing = point && !decor.placing ? thingAt(useRoomStore.getState().decor, point) : null;
        if (point && (decor.placing || thing)) {
          if (thing) decor.startMoving(thing);
          else decor.moveTo(point.x, point.z);
          drag.current = { id: event.pointerId, place: true };
          event.currentTarget.setPointerCapture?.(event.pointerId);
          return;
        }
      }
      drag.current = { id: event.pointerId, x: event.clientX };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      if (drag.current?.id !== event.pointerId) return;
      if (drag.current.place) {
        const point = floorPoint(runtime.view, event.clientX, event.clientY);
        if (point) useDecorStore.getState().moveTo(point.x, point.z);
        return;
      }
      runtime.camera.yaw -= (event.clientX - drag.current.x) * LOOK_SENSITIVITY;
      drag.current.x = event.clientX;
    },
    onPointerUp: (event) => {
      if (drag.current?.id === event.pointerId) drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };

  return { interact, lookHandlers };
}
