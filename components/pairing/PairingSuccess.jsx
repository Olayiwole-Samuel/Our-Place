"use client";

import { m } from "motion/react";
import { useEffect } from "react";
import { Atmosphere } from "@/components/brand/Atmosphere";
import { Button } from "@/components/ui/Button";
import { shortName } from "@/lib/couple/names";
import { useCoupleStore } from "@/store/coupleStore";

const AUTO_CONTINUE_MS = 5200;
const ease = [0.22, 1, 0.36, 1];

/**
 * The first emotional moment in the product: two lights — one green, one pink —
 * drift together and become a heart. Continues on its own, or on tap.
 * Reduced motion: the lights don't travel; content simply fades in.
 */
export function PairingSuccess() {
  const partner = useCoupleStore((state) => state.partner);
  const acknowledge = useCoupleStore((state) => state.acknowledgePairing);

  useEffect(() => {
    const timer = setTimeout(acknowledge, AUTO_CONTINUE_MS);
    return () => clearTimeout(timer);
  }, [acknowledge]);

  const partnerName = partner ? shortName(partner, "") : "";

  return (
    <main className="app-viewport">
      <Atmosphere mood="relationship" />
      <div className="relative flex h-full flex-col items-center justify-center-safe gap-6 overflow-y-auto text-center safe-inset short:gap-4">
        <div aria-hidden="true" className="relative grid h-16 w-40 place-items-center">
          <m.span
            className="absolute size-4 rounded-full bg-green-500"
            initial={{ x: -64, opacity: 0 }}
            animate={{ x: -6, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, ease, times: [0, 0.2, 0.8, 1] }}
          />
          <m.span
            className="absolute size-4 rounded-full bg-pink-400"
            initial={{ x: 64, opacity: 0 }}
            animate={{ x: 6, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, ease, times: [0, 0.2, 0.8, 1] }}
          />
          <m.svg
            width="44"
            height="40"
            viewBox="0 0 44 40"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.15, type: "spring", stiffness: 260, damping: 18 }}
          >
            <path
              d="M22 38C21 38 2 26.5 2 13.5A10.5 10.5 0 0 1 22 8a10.5 10.5 0 0 1 20 5.5C42 26.5 23 38 22 38Z"
              fill="var(--color-pink-500)"
            />
          </m.svg>
        </div>

        <m.div
          className="flex flex-col gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.6, ease }}
        >
          <h1 className="text-display text-white-soft" role="status">
            You&apos;re together.
          </h1>
          <p className="text-subheading text-text-secondary">
            {partnerName ? `You and ${partnerName} — welcome to Our Place.` : "Welcome to Our Place."}
          </p>
        </m.div>

        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2, duration: 0.5 }}>
          <Button size="lg" onClick={acknowledge}>
            Enter Our Place
          </Button>
        </m.div>
      </div>
    </main>
  );
}
