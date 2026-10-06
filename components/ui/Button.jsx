import { PulseDots } from "./PulseDots";

/**
 * The button system. One component, purpose-named variants:
 *
 *   primary       army green — the main action on a screen
 *   secondary     dark with a hairline border — alternatives
 *   relationship  soft pink — couple moments (copy invite, celebrate)
 *   realtime      sky blue — live / play actions (later phases)
 *   destructive   red outline — irreversible actions only
 *   ghost         text-only — low-emphasis navigation (back, sign out)
 *
 * All variants meet WCAG AA text contrast. Always a real <button>; `pending`
 * keeps the label for screen readers and blocks repeat presses.
 */
const VARIANTS = {
  primary: "bg-green-600 text-white shadow-[var(--shadow-tactile)] hover:bg-green-500",
  secondary: "bg-black-800 text-white-soft border border-[var(--border-strong)] shadow-[var(--shadow-tactile)] hover:bg-black-700",
  relationship: "bg-pink-500 text-black-950 shadow-[var(--shadow-tactile)] hover:bg-pink-400",
  realtime: "bg-blue-500 text-black-950 shadow-[var(--shadow-tactile)] hover:bg-blue-400",
  destructive: "bg-transparent text-red-500 border border-red-500/60 hover:bg-red-500/10",
  ghost: "bg-transparent text-text-secondary hover:bg-black-800 hover:text-white-soft",
};

const SIZES = {
  sm: "min-h-9 px-3 text-caption rounded-[var(--radius-sm)]",
  md: "min-h-11 px-5 text-body rounded-[var(--radius-md)]",
  lg: "min-h-12 px-6 text-body rounded-[var(--radius-md)]",
};

export function Button({
  variant = "primary",
  size = "md",
  pending = false,
  pendingLabel,
  className = "",
  type = "button",
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center gap-2.5 font-medium transition duration-150 select-none active:translate-y-px active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {pending && <PulseDots />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
