"use client";

import { useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// px — large, thumb-friendly hit area; smaller on landscape phones (≤ 480px tall).
const SIZES = { regular: { base: 132, knob: 54 }, short: { base: 104, knob: 44 } };

/**
 * Virtual joystick for touch devices. Writes a normalised vector straight into
 * the world's input state (no React state per move except the knob position).
 * Up = forward (away from the camera). Releasing re-centres and stops.
 */
export function Joystick({ input }) {
  const base = useRef(null);
  const pointer = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const { base: BASE, knob: KNOB } = SIZES[useMediaQuery("(max-height: 480px)") ? "short" : "regular"];
  const TRAVEL = (BASE - KNOB) / 2;

  function update(event) {
    const rect = base.current.getBoundingClientRect();
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > TRAVEL) {
      x = (x / distance) * TRAVEL;
      y = (y / distance) * TRAVEL;
    }
    setKnob({ x, y });
    input.setJoystick(x / TRAVEL, -y / TRAVEL);
  }

  function release() {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    input.setJoystick(0, 0);
  }

  return (
    <div
      ref={base}
      role="application"
      aria-label="Movement joystick. Drag to walk."
      className="pointer-events-auto relative grid touch-none place-items-center rounded-full border border-[var(--border-strong)] bg-black-900/55 backdrop-blur-sm select-none"
      style={{ width: BASE, height: BASE }}
      onPointerDown={(event) => {
        event.stopPropagation(); // don't also rotate the camera
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (pointer.current === event.pointerId) update(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full border border-[var(--border-strong)] bg-white-soft/85 shadow-[var(--shadow-tactile)]"
        style={{ width: KNOB, height: KNOB, transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
