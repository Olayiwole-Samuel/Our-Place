"use client";

import { m } from "motion/react";
import { useEffect, useState } from "react";
import { isInAppBrowser } from "@/lib/browser/inAppBrowser";
import { Atmosphere } from "@/components/brand/Atmosphere";
import { Wordmark } from "@/components/brand/Wordmark";
import { GoogleSignInButton } from "./GoogleSignInButton";

const AUTH_ERRORS = {
  cancelled: "Sign-in was cancelled. You can try again whenever you're ready.",
  failed: "We couldn't sign you in. Try again.",
};

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }),
};

/**
 * The entrance to Our Place. One action: Continue with Google.
 * `unconfigured` disables sign-in on deployments without Supabase credentials
 * instead of pretending it works.
 */
export function WelcomeScreen({ authError, unconfigured = false }) {
  const errorMessage = AUTH_ERRORS[authError] ?? (authError ? AUTH_ERRORS.failed : null);
  const [inApp, setInApp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setInApp(isInAppBrowser()), []);

  useEffect(() => {
    // Drop ?auth_error from the address bar so a refresh doesn't repeat the message.
    if (authError) window.history.replaceState(null, "", "/");
  }, [authError]);

  return (
    <main className="app-viewport">
      <Atmosphere />
      <div className="relative flex h-full flex-col items-center justify-center-safe gap-7 overflow-y-auto text-center safe-inset short:gap-4">
        <m.div variants={rise} initial="hidden" animate="show" custom={0}>
          <Wordmark />
        </m.div>

        <m.div variants={rise} initial="hidden" animate="show" custom={1} className="flex flex-col gap-3 short:gap-2">
          <h1 className="text-display text-white-soft">You&apos;re almost home.</h1>
          <p className="text-subheading text-text-secondary">A place for just you two.</p>
        </m.div>

        <m.div variants={rise} initial="hidden" animate="show" custom={2} className="flex flex-col items-center gap-3">
          <GoogleSignInButton disabled={unconfigured} describedBy={unconfigured ? "signin-unavailable" : undefined} />
          {errorMessage && (
            <p role="alert" className="max-w-sm text-caption text-red-500">
              {errorMessage}
            </p>
          )}
          {inApp && (
            <div role="note" className="flex max-w-sm flex-col items-center gap-2 text-caption text-text-secondary">
              <p>Google sign-in doesn&apos;t work inside this app&apos;s browser. Open Our Place in Chrome or Safari instead.</p>
              <button
                type="button"
                className="min-h-10 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 text-white-soft"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.origin);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Link copied" : "Copy link"}
              </button>
            </div>
          )}
          {unconfigured && (
            <p id="signin-unavailable" className="max-w-sm text-caption text-text-muted">
              Sign-in isn&apos;t set up on this server yet.
            </p>
          )}
        </m.div>

        <m.p
          variants={rise}
          initial="hidden"
          animate="show"
          custom={3}
          className="flex items-center gap-2 micro-caps text-text-muted"
        >
          <svg aria-hidden="true" width="10" height="12" viewBox="0 0 10 12" fill="none">
            <rect x="0.75" y="5" width="8.5" height="6.25" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Private by design
        </m.p>
      </div>
    </main>
  );
}
