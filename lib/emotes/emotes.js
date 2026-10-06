import { COUPLE_CHANNEL, coupleChannelName } from "@/lib/realtime/channels";

/**
 * Character emotes: live character events between the two partners.
 *
 *   tap → local character plays it NOW → send_emote RPC → the database
 *   broadcasts { sender_id: <caller>, emote } on the couple's private emotes
 *   topic → the partner's copy of your character plays it.
 *
 * The UI and network only deal in these names; the animation controller
 * (lib/character/animation.js) decides how each body performs them.
 * Emotes aren't chat messages and aren't stored.
 */
export const EMOTE_LIST = Object.freeze([
  { id: "wave", label: "Wave", glyph: "👋" },
  { id: "laugh", label: "Laugh", glyph: "😂" },
  { id: "cry", label: "Cry", glyph: "😢" },
  { id: "kiss", label: "Kiss", glyph: "😘" },
  { id: "dance", label: "Dance", glyph: "💃" },
  { id: "angry", label: "Angry", glyph: "😠" },
  { id: "heart", label: "Heart", glyph: "❤️" },
]);
export const EMOTE_IDS = Object.freeze(EMOTE_LIST.map((emote) => emote.id));
/** Client cooldown between emotes; the server enforces 1 s. */
export const EMOTE_COOLDOWN_MS = 1500;

export function isEmote(name) {
  return EMOTE_IDS.includes(name);
}

/** Cooldown gate (time passed in, so it's testable). */
export function createEmoteGate(cooldownMs = EMOTE_COOLDOWN_MS) {
  let last = -Infinity;
  return {
    tryTrigger(now) {
      if (now - last < cooldownMs) return false;
      last = now;
      return true;
    },
    remaining(now) {
      return Math.max(0, cooldownMs - (now - last));
    },
  };
}

/**
 * Opens the couple's emotes topic (receive-only for clients) and returns
 * { send(name), close() }. `onEmote({ senderId, emote })` fires for valid
 * events; the sender id was written by the database, not by a client.
 */
export function openCoupleEmotes({ supabase, coupleId, onEmote }) {
  const channel = supabase.channel(coupleChannelName(coupleId, COUPLE_CHANNEL.EMOTES), { config: { private: true } });
  let closed = false;
  channel.on("broadcast", { event: "emote" }, ({ payload }) => {
    if (payload && typeof payload.sender_id === "string" && isEmote(payload.emote)) onEmote({ senderId: payload.sender_id, emote: payload.emote });
  });
  Promise.resolve(supabase.realtime.setAuth())
    .catch(() => {})
    .then(() => !closed && channel.subscribe());

  return {
    async send(name) {
      if (!isEmote(name)) return { ok: false, code: "invalid" };
      const { error } = await supabase.rpc("send_emote", { emote: name });
      return error ? { ok: false, code: /emote:([a-z_]+)/.exec(error.message)?.[1] ?? "network" } : { ok: true };
    },
    async close() {
      if (closed) return;
      closed = true;
      await supabase.removeChannel(channel);
    },
  };
}
