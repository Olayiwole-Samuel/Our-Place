/**
 * Supabase Realtime channel naming. Every couple-scoped topic is
 *
 *   our-place:couple:<coupleId>:<channel>
 *
 * and is opened as a PRIVATE channel. Supabase authorizes each join/send with
 * the RLS policies in supabase/migrations/20261005000000_realtime_couple_channels.sql,
 * which only admit members of that couple (resolved from their JWT). Knowing a
 * couple id therefore grants nothing.
 *
 * Supabase Realtime carries presence, light world sync, chat notifications and
 * lobby events. Active game sessions do NOT use these channels — they run on the
 * authoritative Colyseus game server (see lib/game/protocol.js).
 */
export const COUPLE_CHANNEL = Object.freeze({
  PRESENCE: "presence", // who is in the room + living-room movement (pose broadcasts)
  CHAT: "chat", // new-message delivery, broadcast by the database (messages persist in Postgres)
  EMOTES: "emotes", // character emotes, broadcast by the database as the authenticated sender
  VOICE: "voice", // direct-voice signaling between the two browsers (offer/answer/ICE, mic state)
  GAMES: "games", // game session events, broadcast by the database (state itself is fetched per player)
  LOBBY: "lobby", // lobby item / left-message / decoration changes
  NOTIFICATIONS: "notifications",
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function coupleChannelName(coupleId, channel) {
  if (!UUID_PATTERN.test(coupleId ?? "")) throw new Error("coupleChannelName requires a couple UUID.");
  if (!Object.values(COUPLE_CHANNEL).includes(channel)) throw new Error(`Unknown couple channel "${channel}".`);
  return `our-place:couple:${coupleId.toLowerCase()}:${channel}`;
}
