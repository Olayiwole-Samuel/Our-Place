"use client";

import { useEffect, useRef } from "react";
import { openCoupleChat } from "@/lib/chat/chatService";
import { isSupabaseConfigured } from "@/lib/config/env";
import { createEmoteGate, openCoupleEmotes } from "@/lib/emotes/emotes";
import { reportError } from "@/lib/errors";
import { playSound } from "@/lib/ui/sounds";
import { useChatStore } from "@/store/chatStore";
import { useVoiceStore } from "@/store/voiceStore";
import { useWorldStore } from "@/store/worldStore";

/**
 * Opens the couple's communication layer for as long as a space is mounted:
 *
 *   chat    history + realtime delivery (lib/chat/chatService.js → chatStore)
 *   emotes  receive-only realtime topic; sending goes through the database
 *   voice   the shared voice session (voiceStore keeps it across spaces)
 *
 * Exactly one subscription per channel per mount: everything is created in one
 * effect keyed by the verified ids and torn down in its cleanup, so re-renders
 * never duplicate channels. Failures stay contained — the world keeps working.
 *
 * Returns { triggerEmote(name) } — plays locally at once, then broadcasts.
 */
export function useCoupleComms({ runtime, coupleId, userId, partnerId }) {
  const emotesRef = useRef(null);
  const gate = useRef(createEmoteGate());
  const emoteSeq = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      useChatStore.getState().setConnection("closed");
      return undefined;
    }
    let cancelled = false;
    let chat = null;
    let emotes = null;

    import("@/lib/supabase/client")
      .then(({ getSupabaseBrowserClient }) => {
        if (cancelled) return;
        const supabase = getSupabaseBrowserClient();
        chat = openCoupleChat({
          supabase,
          coupleId,
          handlers: {
            onConnection: (status) => useChatStore.getState().setConnection(status),
            onReconnected: () => useChatStore.getState().catchUp(),
            onMessage: (message) => {
              const fromPartner = useChatStore.getState().receive(message);
              if (fromPartner.length && !useChatStore.getState().open) playSound("message");
            },
          },
        });
        useChatStore.getState().attach(chat, { userId, coupleId });

        emotes = openCoupleEmotes({
          supabase,
          coupleId,
          onEmote: ({ senderId, emote }) => {
            // The database stamped the sender. Only the partner's emotes animate
            // the partner; our own (from another tab) are ignored here.
            if (senderId !== partnerId) return;
            emoteSeq.current += 1;
            runtime.emotes.partner = { name: emote, id: `p${emoteSeq.current}` };
          },
        });
        emotesRef.current = emotes;
      })
      .catch((error) => {
        reportError(error, { feature: "comms" });
        useChatStore.getState().setConnection("closed");
      });

    return () => {
      cancelled = true;
      emotesRef.current = null;
      chat?.close();
      emotes?.close();
      useChatStore.getState().detach();
      runtime.emotes.local = null;
      runtime.emotes.partner = null;
    };
  }, [runtime, coupleId, userId, partnerId]);

  // Voice: shared session; released (with a short linger) when the space unmounts.
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    const release = useVoiceStore.getState().acquire({ coupleId, userId, partnerId });
    const onPageHide = () => useVoiceStore.getState().shutdown();
    const onOnline = () => useVoiceStore.getState().retry();
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      release();
    };
  }, [coupleId, userId, partnerId]);

  return {
    /** Returns false when still cooling down (the UI can show it). */
    triggerEmote(name) {
      if (!gate.current.tryTrigger(performance.now())) return false;
      emoteSeq.current += 1;
      runtime.emotes.local = { name, id: `l${emoteSeq.current}` }; // the character reacts now
      emotesRef.current?.send(name).then(
        () => {},
        () => {}, // the partner may miss this one; nothing else is affected
      );
      return true;
    },
  };
}

/** Partner arrival/departure as quiet lines in the chat feed (not saved). */
export function usePresenceNotices(partnerName) {
  const status = useWorldStore((state) => state.partner.status);
  const announce = useWorldStore((state) => state.partner.announce);
  const previous = useRef(status);
  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (status === "online" && announce) useChatStore.getState().addNotice(`❤️ ${partnerName} is here`);
    else if (status === "offline" && (before === "online" || before === "away")) useChatStore.getState().addNotice(`${partnerName} left Our Place`);
  }, [status, announce, partnerName]);
}
