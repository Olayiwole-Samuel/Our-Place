"use client";

import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Atmosphere } from "@/components/brand/Atmosphere";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { useCoupleStore } from "@/store/coupleStore";
import { InviteCodePanel } from "./InviteCodePanel";
import { JoinCodePanel } from "./JoinCodePanel";

const swap = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
};

/**
 * Authenticated but unpaired. Two paths: share your code, or enter theirs.
 * Opens straight onto the code if this user already has a live invite.
 */
export function PairingScreen() {
  const me = useCoupleStore((state) => state.me);
  const hasInvite = useCoupleStore((state) => Boolean(state.invite));
  const [mode, setMode] = useState(hasInvite ? "invite" : "choose");

  return (
    <main className="app-viewport">
      <Atmosphere mood="relationship" />
      <div className="relative flex h-full flex-col overflow-y-auto safe-inset">
        <header className="flex items-center justify-between gap-4">
          <Wordmark size="sm" />
          <div className="flex items-center gap-1">
            <span className="hidden text-caption text-text-muted md:inline">{me?.displayName}</span>
            <SignOutButton />
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-[minmax(0,1fr)] items-center gap-6 py-4 md:grid-cols-[1fr_minmax(0,26rem)] md:gap-12 short:py-2">
          <section className="flex flex-col gap-3 text-center md:text-left short:gap-2">
            <p className="micro-caps text-pink-400">Just the two of you</p>
            <h1 className="text-heading text-white-soft">Bring your person into Our Place.</h1>
            <p className="max-w-md text-body text-text-secondary max-md:mx-auto short:hidden">
              Our Place is made for exactly two. Share your code with them, or enter theirs. Once you&apos;re paired,
              it&apos;s yours — together.
            </p>
          </section>

          <section aria-live="polite" className="panel relative flex min-h-64 flex-col justify-center p-4 sm:p-6 short:min-h-0 short:p-4">
            <AnimatePresence mode="wait" initial={false}>
              {mode === "choose" && (
                <m.div key="choose" {...swap} className="flex flex-col gap-3">
                  <Button size="lg" onClick={() => setMode("invite")}>
                    Create invite
                  </Button>
                  <div aria-hidden="true" className="flex items-center gap-3 text-caption text-text-muted">
                    <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                    or
                    <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                  </div>
                  <Button size="lg" variant="secondary" onClick={() => setMode("join")}>
                    I have an invite code
                  </Button>
                </m.div>
              )}
              {mode === "invite" && (
                <m.div key="invite" {...swap} className="flex flex-col gap-4">
                  <InviteCodePanel />
                  <Button variant="ghost" size="sm" className="self-center" onClick={() => setMode("join")}>
                    I have their code instead
                  </Button>
                </m.div>
              )}
              {mode === "join" && (
                <m.div key="join" {...swap} className="flex flex-col gap-4">
                  <JoinCodePanel />
                  <Button variant="ghost" size="sm" className="self-center" onClick={() => setMode(hasInvite ? "invite" : "choose")}>
                    ← Back
                  </Button>
                </m.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </main>
  );
}
