import { COUPLE_CHANNEL, coupleChannelName } from "@/lib/realtime/channels";
import { openResilientChannel } from "@/lib/realtime/resilientChannel";
import { PAGE_SIZE, chatErrorCode, isMissingReplySupport, toMessage } from "./messages";

const BASE_COLUMNS = "id, sender_id, type, content, client_id, created_at";
const REPLY_COLUMNS = `${BASE_COLUMNS}, reply_to`;

/**
 * The couple's chat, encapsulating Supabase:
 *
 *   history   public.messages (RLS: only this couple's rows), newest-first pages
 *             of PAGE_SIZE using a (created_at, id) keyset — never the whole history
 *   send      public.send_message RPC — the database derives sender + couple
 *   delivery  the couple's PRIVATE chat topic, where a database trigger broadcasts
 *             each new row. Clients can't broadcast there (RLS), so a delivered
 *             message is always a real, saved row.
 *   catch-up  after a reconnect, rows newer than the newest one we have are read
 *             once from the table (no polling)
 *   replies   messages.reply_to (20261021000000_chat_replies.sql). Until that
 *             migration is applied the column is missing: the first page notices,
 *             reads without it and reports replies: false, so the UI hides replies.
 *
 * handlers: onMessage(message), onConnection("connecting" | "live" | "reconnecting" | "closed"),
 *           onReconnected() — call catchUp(newest) from it.
 */
export function openCoupleChat({ supabase, coupleId, handlers }) {
  const topic = coupleChannelName(coupleId, COUPLE_CHANNEL.CHAT);
  let closed = false;
  let subscribedOnce = false;

  handlers.onConnection("connecting");
  const live = openResilientChannel({
    supabase,
    topic,
    options: { config: { private: true } },
    area: "chat",
    bind: (channel) =>
      channel.on("broadcast", { event: "message" }, ({ payload }) => {
        const message = toMessage(payload);
        if (message) handlers.onMessage(message);
      }),
    onStatus: (status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") {
        handlers.onConnection("live");
        if (subscribedOnce) handlers.onReconnected?.();
        subscribedOnce = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        handlers.onConnection("reconnecting"); // a closed channel is rejoined
      }
    },
  });

  const rows = (data) => (data ?? []).map(toMessage).filter(Boolean);
  let replies = true; // until the database says otherwise
  const columns = () => (replies ? REPLY_COLUMNS : BASE_COLUMNS);
  const fail = (error) => Object.assign(new Error(error.message), { code: chatErrorCode(error) });

  return {
    /** Newest PAGE_SIZE messages, or the PAGE_SIZE before `before` (a message). Also says whether replies are available. */
    async loadPage(before = null) {
      const page = () => {
        let query = supabase.from("messages").select(columns()).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
        if (before) query = query.or(`created_at.lt."${before.cursor}",and(created_at.eq."${before.cursor}",id.lt.${before.id})`);
        return query;
      };
      let { data, error } = await page();
      if (error && replies && isMissingReplySupport(error)) {
        replies = false;
        ({ data, error } = await page());
      }
      if (error) throw fail(error);
      return { messages: rows(data).reverse(), hasOlder: (data?.length ?? 0) === PAGE_SIZE, replies };
    },
    /** Specific messages by id (originals of replies outside the loaded window). RLS keeps it to this couple. */
    async loadByIds(ids) {
      if (!ids.length || !replies) return [];
      const { data, error } = await supabase.from("messages").select(columns()).in("id", ids);
      if (error) throw fail(error);
      return rows(data);
    },
    /** Rows saved after `after` (a message) — used once after reconnecting. */
    async catchUp(after) {
      if (!after) return [];
      const { data, error } = await supabase
        .from("messages")
        .select(columns())
        .or(`created_at.gt."${after.cursor}",and(created_at.eq."${after.cursor}",id.gt.${after.id})`)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw fail(error);
      return rows(data);
    },
    /** reply_to is sent only for replies, so plain messages work with or without the replies migration. */
    async send(content, clientId, replyTo = null) {
      const args = replyTo && replies ? { content, client_id: clientId, reply_to: replyTo } : { content, client_id: clientId };
      const { data, error } = await supabase.rpc("send_message", args);
      if (error) throw fail(error);
      const message = toMessage(Array.isArray(data) ? data[0] : data);
      if (!message) throw Object.assign(new Error("bad_response"), { code: "unknown" });
      return message;
    },
    async close() {
      if (closed) return;
      closed = true;
      await live.close();
    },
  };
}
