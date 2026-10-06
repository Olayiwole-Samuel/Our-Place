"use client";

import { forwardRef } from "react";

const TONES = {
  default: "text-text-secondary hover:text-white-soft",
  live: "text-black-950 bg-green-500! border-green-500/80 hover:bg-green-600!",
  warn: "text-pink-400 hover:text-pink-500",
  active: "text-white-soft border-blue-400/60",
};

/**
 * Square HUD control matching the Phase 3 HUD (panel surface, control size,
 * tactile press). `pressed` makes it a toggle for assistive tech.
 */
export const HudButton = forwardRef(function HudButton({ label, pressed, expanded, controls, tone = "default", disabled, onClick, children, badge, className = "" }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      className={`panel relative grid size-[var(--control-size)] place-items-center rounded-[var(--radius-md)] transition-[color,background-color,transform] duration-150 active:scale-95 disabled:cursor-default disabled:opacity-60 motion-reduce:transition-none ${TONES[tone]} ${className}`}
    >
      {children}
      {badge}
    </button>
  );
});
