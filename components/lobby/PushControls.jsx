"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState } from "@/lib/push/client";

/**
 * Phone notifications: when your partner arrives in Our Place and when they
 * message you, while you're not in the app. On this device only; a tap is
 * required (browsers never let a site turn this on by itself).
 */
const DISMISS_KEY = "our-place:push-prompt-dismissed";

function usePushState() {
  const [state, setState] = useState("loading");
  useEffect(() => {
    let live = true;
    pushState()
      .then((value) => live && setState(value))
      .catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);
  return [state, setState];
}

const COPY = {
  unsupported: "Not available in this browser. On iPhone, add Our Place to your Home Screen first.",
  denied: "Blocked in your browser settings — allow notifications for this site to turn them on.",
};

/** Account-menu switch. */
export function PushSetting({ partnerName }) {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  if (state === "loading") return null;
  const on = state === "on";
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] px-3 py-2 hover:bg-black-800">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy || state === "unsupported" || state === "denied"}
        onClick={async () => {
          setBusy(true);
          setState(on ? await disablePush() : await enablePush());
          setBusy(false);
        }}
        className="flex items-center justify-between gap-2 text-left text-body text-white-soft disabled:opacity-60"
      >
        <span className="flex items-center gap-2">
          {on ? <Bell aria-hidden="true" size={15} /> : <BellOff aria-hidden="true" size={15} />} Phone notifications
        </span>
        <span className={`text-caption ${on ? "text-green-500" : "text-text-muted"}`}>{on ? "On" : "Off"}</span>
      </button>
      <span className="text-micro tracking-normal text-text-muted">{COPY[state] ?? `When ${partnerName} arrives or messages you while you're away.`}</span>
    </div>
  );
}

/** A one-time, dismissible invitation in the room. */
export function PushPrompt({ partnerName }) {
  const [state, setState] = usePushState();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (dismissed || state !== "off") return null;
  const close = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode: it just shows again next time
    }
  };
  return (
    <section aria-label="Phone notifications" className="panel pointer-events-auto flex items-center gap-3 rounded-[var(--radius-lg)] p-3 short:p-2">
      <Bell aria-hidden="true" size={18} className="shrink-0 text-pink-400" />
      <p className="flex-1 text-caption text-white-soft">Get a notification when {partnerName} arrives or messages you?</p>
      <button
        type="button"
        onClick={async () => {
          setState(await enablePush());
          close();
        }}
        className="min-h-9 rounded-[var(--radius-md)] bg-green-600 px-3 text-caption font-semibold text-white"
      >
        Turn on
      </button>
      <button type="button" onClick={close} className="min-h-9 px-2 text-caption text-text-secondary">
        Not now
      </button>
    </section>
  );
}
