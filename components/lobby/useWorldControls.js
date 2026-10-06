"use client";

import { useCallback, useEffect, useRef } from "react";
import { isTypingTarget } from "@/lib/world/input";
import { useWorldStore } from "@/store/worldStore";
import { INTERACTION_HANDLERS } from "./interactionHandlers";

const LOOK_SENSITIVITY = 0.006; // radians per pixel dragged

/**
 * Desktop and touch controls for the world:
 *   WASD / arrows → move      drag anywhere on the world → look around
 *   E or Enter → interact     Esc → close an info card
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

  // Drag to look (mouse or a finger on the world, not on HUD controls).
  const drag = useRef(null);
  const lookHandlers = {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      drag.current = { id: event.pointerId, x: event.clientX };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      if (drag.current?.id !== event.pointerId) return;
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
