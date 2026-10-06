import { COUPLE_CHANNEL, coupleChannelName } from "@/lib/realtime/channels";
import { PAGE_SIZE, chatErrorCode, toMessage } from "./messages";

const COLUMNS = "id, sender_id, type, content, client_id, created_at";

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
 *
 * handlers: onMessage(message), onConnection("connecting" | "live" | "reconnecting" | "closed"),
 *           onReconnected() — call catchUp(newest) from it.
 */
export function openCoupleChat({ supabase, coupleId, handlers }) {
  const topic = coupleChannelName(coupleId, COUPLE_CHANNEL.CHAT);
  let closed = false;
  let subscribedOnce = false;

  const channel = supabase.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: "message" }, ({ payload }) => {
    const message = toMessage(payload);
    if (message) handlers.onMessage(message);
  });

  handlers.onConnection("connecting");
  Promise.resolve(supabase.realtime.setAuth())
    .catch(() => {})
    .then(() => {
      if (closed) return;
      channel.subscribe((status) => {
        if (closed) return;
        if (status === "SUBSCRIBED") {
          handlers.onConnection("live");
          if (subscribedOnce) handlers.onReconnected?.();
          subscribedOnce = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          handlers.onConnection("reconnecting");
        } else if (status === "CLOSED") {
          handlers.onConnection("closed");
        }
      });
    });

  const rows = (data) => (data ?? []).map(toMessage).filter(Boolean);

  return {
    /** Newest PAGE_SIZE messages, or the PAGE_SIZE before `before` (a message). */
    async loadPage(before = null) {
      let query = supabase.from("messages").select(COLUMNS).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
      if (before) query = query.or(`created_at.lt."${before.cursor}",and(created_at.eq."${before.cursor}",id.lt.${before.id})`);
      const { data, error } = await query;
      if (error) throw Object.assign(new Error(error.message), { code: chatErrorCode(error) });
      return { messages: rows(data).reverse(), hasOlder: (data?.length ?? 0) === PAGE_SIZE };
    },
    /** Rows saved after `after` (a message) — used once after reconnecting. */
    async catchUp(after) {
      if (!after) return [];
      const { data, error } = await supabase
        .from("messages")
        .select(COLUMNS)
        .or(`created_at.gt."${after.cursor}",and(created_at.eq."${after.cursor}",id.gt.${after.id})`)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw Object.assign(new Error(error.message), { code: chatErrorCode(error) });
      return rows(data);
    },
    async send(content, clientId) {
      const { data, error } = await supabase.rpc("send_message", { content, client_id: clientId });
      if (error) throw Object.assign(new Error(error.message), { code: chatErrorCode(error) });
      const message = toMessage(Array.isArray(data) ? data[0] : data);
      if (!message) throw Object.assign(new Error("bad_response"), { code: "unknown" });
      return message;
    },
    async close() {
      if (closed) return;
      closed = true;
      await supabase.removeChannel(channel);
    },
  };
}
