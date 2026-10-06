/**
 * Cinematic backdrop for full-screen moments (welcome, pairing, loading):
 * near-black base, one slow army-green light and a faint pink warmth, with a
 * vignette for depth. Pure CSS, no assets, motion disabled for reduced motion.
 *
 * mood="brand" leans green; mood="relationship" lets the pink come forward.
 */
export function Atmosphere({ mood = "brand" }) {
  const pinkStrength = mood === "relationship" ? "opacity-100" : "opacity-60";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-black-950">
      <div
        className="absolute -bottom-[45vmax] -left-[25vmax] size-[110vmax] animate-drift rounded-full"
        style={{ background: "radial-gradient(closest-side, var(--glow-brand), transparent)" }}
      />
      <div
        className={`absolute -top-[30vmax] -right-[20vmax] size-[80vmax] animate-drift rounded-full [animation-delay:-9s] ${pinkStrength}`}
        style={{ background: "radial-gradient(closest-side, var(--glow-relationship), transparent)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 40%, var(--color-black-950) 100%)" }}
      />
    </div>
  );
}
