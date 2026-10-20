import "server-only";
import webpush from "web-push";
import { PAIRING_ERROR, PairingError } from "@/lib/couple/errors";
import { reportError } from "@/lib/errors";

/**
 * Phone / browser push notifications (Web Push with VAPID keys):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a URL or mailto:)
 *
 * We tell the partner when you ARRIVE in Our Place, and about new MESSAGES —
 * only while they aren't in the app themselves (their last visit heartbeat is
 * older than ACTIVE_MS), and throttled per kind, so nobody gets spammed.
 * Endpoints the push service says are gone are deleted.
 */
const ACTIVE_MS = 3 * 60_000; // note_presence beats every 2 min while the room is open and visible
const THROTTLE_MS = { arrived: 20 * 60_000, message: 20_000 };

let configured = null;
export function pushConfigured(env = process.env) {
  if (configured !== null && env === process.env) return configured;
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim() || "https://our-place-tau.vercel.app";
  const ok = Boolean(publicKey && privateKey);
  if (ok) webpush.setVapidDetails(subject, publicKey, privateKey);
  if (env === process.env) configured = ok;
  return ok;
}

async function membership(admin, userId) {
  const { data, error } = await admin.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
  if (!data) throw new PairingError(PAIRING_ERROR.NOT_PAIRED);
  const { data: members } = await admin.from("couple_members").select("user_id").eq("couple_id", data.couple_id);
  const partnerId = (members ?? []).map((m) => m.user_id).find((id) => id !== userId) ?? null;
  return { coupleId: data.couple_id, partnerId };
}

/** Saves (or refreshes) this browser's push subscription for the user. */
export async function saveSubscription({ admin, userId, subscription }) {
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys ?? {};
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 200 || keys.auth.length > 100) {
    throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  }
  await membership(admin, userId); // paired users only
  const { error } = await admin.from("push_subscriptions").upsert({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
}

export async function removeSubscription({ admin, userId, endpoint }) {
  if (typeof endpoint !== "string") return;
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId);
}

async function partnerIsActive(admin, coupleId, partnerId, now) {
  const { data } = await admin.from("couple_visits").select("last_at").eq("couple_id", coupleId).eq("user_id", partnerId).order("last_at", { ascending: false }).limit(1);
  const last = data?.[0]?.last_at ? Date.parse(data[0].last_at) : 0;
  return now - last < ACTIVE_MS;
}

async function throttled(admin, userId, kind, now) {
  const { data } = await admin.from("push_log").select("sent_at").eq("user_id", userId).eq("kind", kind).maybeSingle();
  if (data && now - Date.parse(data.sent_at) < THROTTLE_MS[kind]) return true;
  await admin.from("push_log").upsert({ user_id: userId, kind, sent_at: new Date(now).toISOString() }, { onConflict: "user_id,kind" });
  return false;
}

async function deliver(admin, userId, payload) {
  const { data: subscriptions } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 600, urgency: "high" });
      sent += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id);
      else reportError(error, { operation: "send push" });
    }
  }
  if (sent) await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("user_id", userId);
  return sent;
}

const firstName = async (admin, userId) => {
  const { data } = await admin.from("users").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name?.split(" ")[0] || "Your person";
};

/** "❤️ King is in Our Place" — to the partner, if they're not in the app. */
export async function notifyArrival({ admin, userId, now = Date.now() }) {
  if (!pushConfigured()) return { sent: 0, reason: "not_configured" };
  const { coupleId, partnerId } = await membership(admin, userId);
  if (!partnerId || (await partnerIsActive(admin, coupleId, partnerId, now))) return { sent: 0, reason: "partner_here" };
  if (await throttled(admin, partnerId, "arrived", now)) return { sent: 0, reason: "throttled" };
  const name = await firstName(admin, userId);
  return { sent: await deliver(admin, partnerId, { title: "Our Place", body: `❤️ ${name} is in Our Place — come join`, tag: "arrived", url: "/lobby" }) };
}

/** A new message from you — to the partner, if they're not in the app. Only YOUR own message can be announced. */
export async function notifyMessage({ admin, userId, messageId, now = Date.now() }) {
  if (!pushConfigured()) return { sent: 0, reason: "not_configured" };
  if (typeof messageId !== "string") throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  const { coupleId, partnerId } = await membership(admin, userId);
  const { data: message } = await admin.from("messages").select("id, content, sender_id, couple_id, created_at").eq("id", messageId).maybeSingle();
  if (!message || message.sender_id !== userId || message.couple_id !== coupleId || now - Date.parse(message.created_at) > 120_000) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  if (!partnerId || (await partnerIsActive(admin, coupleId, partnerId, now))) return { sent: 0, reason: "partner_here" };
  if (await throttled(admin, partnerId, "message", now)) return { sent: 0, reason: "throttled" };
  const name = await firstName(admin, userId);
  const preview = message.content.length > 120 ? `${message.content.slice(0, 119)}…` : message.content;
  return { sent: await deliver(admin, partnerId, { title: name, body: preview, tag: "message", url: "/lobby?chat=1" }) };
}
