import { toMessage } from "@/lib/chat/messages";
import { useChatStore } from "@/store/chatStore";

/**
 * DEVELOPMENT ONLY — an in-memory chat for /dev/hud?chat=1, so the panel can be
 * checked with real-looking history: replies (one quoting a message outside the
 * loaded window, one whose original is gone), sending, and — with &typing=1 —
 * the partner typing. Nothing touches the network.
 */
export function startChatSample({ meId, partnerId, coupleId, typing = false }) {
  let n = 0;
  const id = () => `5a5a5a5a-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const rows = [];
  const add = (sender, content, minutesAgo, replyTo = null) => {
    const row = { id: id(), sender_id: sender, type: "text", content, client_id: null, reply_to: replyTo, created_at: at(minutesAgo) };
    rows.push(row);
    return row;
  };

  // Outside the loaded window: fetched by id, like a quote of last month's message.
  const older = { id: "5a5a5a5a-0000-4000-8000-0000000000aa", sender_id: meId, type: "text", content: "We should go back to that suya spot in Lekki 😋", client_id: null, reply_to: null, created_at: at(60 * 24 * 30) };
  const gone = "5a5a5a5a-0000-4000-8000-0000000000bb";

  add(partnerId, "Good morning sunshine ☀️", 180);
  const plans = add(meId, "Morning! Movie night on Friday? I'll upload something good 🍿", 175);
  add(partnerId, "Yes please. Can we do the Squid Game one you talked about?", 170, plans.id);
  add(partnerId, "Also, I miss you already ❤️", 169);
  add(meId, "Miss you more 🥺", 150);
  add(partnerId, "Saturday then. I'll book a table", 90, older.id);
  add(meId, "That message got lost somewhere", 40, gone);
  const question = add(partnerId, "Are you free for a game of Whot later? Loser cooks dinner 😏\nNo excuses this time.", 12);
  add(meId, "You're on", 10, question.id);

  const service = {
    loadPage: async () => ({ messages: rows.map(toMessage), hasOlder: false, replies: true }),
    loadByIds: async (ids) => (ids.includes(older.id) ? [toMessage(older)] : []),
    catchUp: async () => [],
    send: async (content, clientId, replyTo) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return toMessage({ id: id(), sender_id: meId, type: "text", content, client_id: clientId, reply_to: replyTo ?? null, created_at: new Date().toISOString() });
    },
  };

  const chat = useChatStore.getState();
  chat.attach(service, { userId: meId, coupleId });
  chat.setConnection("live");
  // The preview has no session, so the real channels report "reconnecting": keep the sample live.
  const timer = setInterval(() => {
    useChatStore.getState().setConnection("live");
    if (typing) useChatStore.getState().setPartnerTyping(true);
  }, 3000);
  if (typing) chat.setPartnerTyping(true);
  return () => clearInterval(timer);
}
