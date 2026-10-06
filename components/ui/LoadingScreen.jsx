import { Atmosphere } from "@/components/brand/Atmosphere";
import { BrandMark } from "@/components/brand/BrandMark";
import { PulseDots } from "./PulseDots";

/**
 * Branded loading state for app start, auth resolution, sign-out, the 3D room,
 * partner connection, games and media. `label` names what is loading (visible
 * and announced). variant="screen" fills the viewport; "inline" fits a panel.
 */
export function LoadingScreen({ label = "Opening Our Place", variant = "screen" }) {
  if (variant === "inline") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-8">
        <PulseDots size="lg" />
        <p className="text-caption text-text-muted">{label}</p>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="app-viewport">
      <Atmosphere />
      <div className="relative flex h-full flex-col items-center justify-center gap-5 safe-inset">
        <BrandMark size={40} />
        <p className="micro-caps text-white-soft">Our Place</p>
        <PulseDots size="lg" />
        <p className="text-caption text-text-muted">{label}</p>
      </div>
    </div>
  );
}
