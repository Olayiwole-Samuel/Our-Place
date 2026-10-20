"use client";

/**
 * Push notifications — browser side. Turned on by the user (a tap: browsers
 * require it), stored per device on the server. iPhone: only when Our Place is
 * added to the Home Screen (iOS 16.4+). Never asks by itself.
 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(PUBLIC_KEY);
}

const keyBytes = (base64) => {
  const padded = (base64 + "===".slice((base64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const post = (body) =>
  fetch("/api/push", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.ok)
    .catch(() => false);

/** Current state on this device: "unsupported" | "denied" | "on" | "off". */
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

/** Asks permission (must follow a tap) and registers this device. */
export async function enablePush() {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
  return (await post({ action: "subscribe", subscription: subscription.toJSON() })) ? "on" : "off";
}

export async function disablePush() {
  const registration = await navigator.serviceWorker?.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await post({ action: "unsubscribe", endpoint: subscription.endpoint });
    await subscription.unsubscribe().catch(() => {});
  }
  return "off";
}

/** Tells the server we arrived / sent a message; it decides whether the partner is notified. */
export const announceArrival = () => post({ action: "arrived" });
export const announceMessage = (messageId) => post({ action: "message", messageId });
