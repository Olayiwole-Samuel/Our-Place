"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

// Harmless UI preference only — product state always comes from the server.
const STORAGE_KEY = "ourplace.onboarding.v1";

function readSeen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "seen");
  } catch {
    // Private mode / blocked storage: the hint may reappear next time. That's fine.
  }
}

/** First-visit orientation: where you are, how to move, how to interact, where your partner appears. */
export function OnboardingHint({ touch, partnerName, ready }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (ready && !readSeen()) setVisible(true);
  }, [ready]);

  const dismiss = () => {
    markSeen();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <m.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.4, duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
          aria-labelledby="onboarding-title"
          className="panel pointer-events-auto flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 p-5 short:gap-2 short:p-4"
        >
          <h2 id="onboarding-title" className="text-subheading text-white-soft">
            Welcome home.
          </h2>
          <ul className="flex flex-col gap-1.5 text-caption text-text-secondary">
            <li>{touch ? "Move with the joystick. Drag the room to look around." : "Move with WASD or the arrow keys. Drag to look around."}</li>
            <li>{touch ? "Walk up to things to interact." : "Walk up to things and press E to interact."}</li>
            <li>
              <span className="text-pink-400">{partnerName}</span> appears here whenever they&apos;re in Our Place.
            </li>
          </ul>
          <Button size="sm" variant="secondary" className="self-end" onClick={dismiss}>
            Got it
          </Button>
        </m.section>
      )}
    </AnimatePresence>
  );
}
