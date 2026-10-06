"use client";

import { MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useChatStore } from "@/store/chatStore";
import { useWorldStore } from "@/store/worldStore";
import { ChatPanel } from "./ChatPanel";
import { EmoteControl } from "./EmoteControl";
import { HudButton } from "./HudButton";
import { VoiceControl } from "./VoiceControl";

const PEEK_MS = 4500;

/**
 * Bottom-right communication controls: emotes, chat, mic — in the corner the
 * Phase 3 HUD reserved for them. Each part sits in its own error boundary, so a
 * failure in one (e.g. voice) never takes down chat, emotes or the world.
 */
export function CommsDock({ meId, partnerName, runtime, onEmote }) {
  const [emotesOpen, setEmotesOpen] = useState(false);

  return (
    <div role="group" aria-label="Chat, voice and emotes" className="pointer-events-auto flex items-end gap-2">
      <Isolated name="emotes">
        <EmoteControl open={emotesOpen} onOpenChange={setEmotesOpen} onEmote={onEmote} />
      </Isolated>
      <Isolated name="chat">
        <ChatControl meId={meId} partnerName={partnerName} runtime={runtime} />
      </Isolated>
      <Isolated name="voice">
        <VoiceControl />
      </Isolated>
    </div>
  );
}

function Isolated({ name, children }) {
  return (
    <ErrorBoundary
      name={`comms-${name}`}
      fallback={({ reset }) => (
        <HudButton label={`${name[0].toUpperCase()}${name.slice(1)} had a problem. Tap to reload it`} tone="warn" onClick={reset}>
          <X aria-hidden="true" size={18} />
        </HudButton>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

function ChatControl({ meId, partnerName, runtime }) {
  const open = useChatStore((state) => state.open);
  const unread = useChatStore((state) => state.unread);
  const panelId = useId();
  const buttonRef = useRef(null);
  const peek = usePartnerPeek(meId, open);

  const setOpen = useCallback((next) => useChatStore.getState().setOpen(next), []);
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  }, [setOpen]);

  // Desktop: Enter opens chat when there's nothing to interact with (E/Enter
  // still interacts near objects). Never while typing somewhere else.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Enter" || event.target !== document.body || event.repeat) return;
      if (useWorldStore.getState().interactionTarget || useChatStore.getState().open) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <div className="relative">
      {open && (
        <ChatPanel
          panelId={panelId}
          meId={meId}
          partnerName={partnerName}
          onClose={close}
          // Typing must not leave the character walking on a held key.
          onComposerFocus={() => runtime.input.releaseAll()}
        />
      )}
      {!open && peek && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="panel absolute right-0 bottom-full mb-2 flex w-max max-w-[min(18rem,60vw)] items-baseline gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-left text-caption [animation:panel-in_180ms_var(--ease-out-soft)] motion-reduce:animate-none"
        >
          <span className="shrink-0 font-semibold text-pink-400">{partnerName}</span>
          <span className="truncate text-text-secondary">{peek.content}</span>
        </button>
      )}
      <HudButton
        ref={buttonRef}
        label={open ? "Close chat" : unread ? `Open chat, ${unread} unread` : "Open chat"}
        expanded={open}
        controls={open ? panelId : undefined}
        tone={open ? "active" : "default"}
        onClick={() => (open ? close() : setOpen(true))}
        badge={
          !open && unread > 0 ? (
            <span aria-hidden="true" className="hud-numeral absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-[0.6875rem] leading-none text-black-950">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null
        }
      >
        <MessageCircle aria-hidden="true" size={19} strokeWidth={1.75} />
      </HudButton>
    </div>
  );
}

/** The latest partner message, shown briefly above the chat button while chat is closed. */
function usePartnerPeek(meId, open) {
  const [peek, setPeek] = useState(null);
  const unread = useChatStore((state) => state.unread);
  const lastSeenUnread = useRef(unread);

  useEffect(() => {
    const grew = unread > lastSeenUnread.current;
    lastSeenUnread.current = unread;
    if (!grew || open) return undefined;
    const messages = useChatStore.getState().messages;
    const latest = [...messages].reverse().find((message) => message.senderId && message.senderId !== meId && message.type === "text");
    if (!latest) return undefined;
    setPeek(latest);
    const timer = setTimeout(() => setPeek(null), PEEK_MS);
    return () => clearTimeout(timer);
  }, [unread, open, meId]);

  useEffect(() => {
    if (open) setPeek(null);
  }, [open]);

  return peek;
}
