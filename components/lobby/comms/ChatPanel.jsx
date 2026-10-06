"use client";

import { ArrowDown, LoaderCircle, SendHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHAT_ERROR_COPY, MAX_MESSAGE_LENGTH } from "@/lib/chat/messages";
import { useChatStore } from "@/store/chatStore";

const NEAR_BOTTOM_PX = 48;
const NEAR_TOP_PX = 60;
let savedScroll = null; // { top, atBottom } — survives closing/reopening the panel

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

function dayLabel(ms) {
  const day = new Date(ms).toDateString();
  const today = new Date();
  if (day === today.toDateString()) return "Today";
  if (day === new Date(today.getTime() - 86_400_000).toDateString()) return "Yesterday";
  return dateFormat.format(ms);
}

/**
 * The chat panel: floats over the world's bottom-right corner, never navigates
 * away. Text is always rendered as text (React escapes it; no HTML injection).
 */
export function ChatPanel({ meId, partnerName, onClose, onComposerFocus, panelId }) {
  const status = useChatStore((state) => state.status);
  const connection = useChatStore((state) => state.connection);
  const messages = useChatStore((state) => state.messages);
  const hasOlder = useChatStore((state) => state.hasOlder);
  const loadingOlder = useChatStore((state) => state.loadingOlder);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const anchor = useRef(null); // keeps the view still when older messages load above
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState(null);
  const keyboardInset = useKeyboardInset();

  // Restore scroll on open; remember it on close.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    if (savedScroll && !savedScroll.atBottom) {
      list.scrollTop = savedScroll.top;
      atBottom.current = false;
    } else {
      list.scrollTop = list.scrollHeight;
    }
    return () => {
      savedScroll = { top: list.scrollTop, atBottom: atBottom.current };
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // New content: stay pinned to the bottom if the reader was there; keep the
  // view still when older messages were inserted above.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (anchor.current) {
      list.scrollTop = anchor.current.top + (list.scrollHeight - anchor.current.height);
      anchor.current = null;
      return;
    }
    if (atBottom.current) list.scrollTop = list.scrollHeight;
    else setShowJump(true);
    useChatStore.getState().markSeen();
  }, [messages]);

  const onScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    atBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current) setShowJump(false);
    const store = useChatStore.getState();
    if (list.scrollTop < NEAR_TOP_PX && store.hasOlder && !store.loadingOlder) {
      anchor.current = { top: list.scrollTop, height: list.scrollHeight };
      store.loadOlder();
    }
  }, []);

  const jumpToLatest = () => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  };

  const submit = async () => {
    if (!draft.trim()) return;
    atBottom.current = true;
    const text = draft;
    setDraft("");
    const error = await useChatStore.getState().sendMessage(text);
    if (error) {
      setDraft(text);
      setComposerError(error);
    } else {
      setComposerError(null);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const remaining = MAX_MESSAGE_LENGTH - [...draft].length;
  const offline = connection !== "live";

  return (
    <section
      id={panelId}
      aria-label={`Chat with ${partnerName}`}
      style={keyboardInset ? { bottom: keyboardInset } : undefined}
      className="chat-panel panel pointer-events-auto fixed z-30 flex flex-col overflow-hidden rounded-[var(--radius-lg)] shadow-[0_18px_48px_rgba(0,0,0,0.45)] [animation:panel-in_180ms_var(--ease-out-soft)] motion-reduce:animate-none"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-2 pr-1.5 pl-4">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${offline ? "bg-text-muted animate-pulse-live" : "bg-blue-400"}`} />
          <h2 className="truncate text-caption font-semibold text-white-soft">{partnerName}</h2>
          {offline && <span className="text-micro text-text-muted">{connection === "closed" ? "offline" : "reconnecting…"}</span>}
        </div>
        <button
          type="button"
          aria-label="Close chat"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-black-700 hover:text-white-soft"
        >
          <X aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" className="h-full overflow-y-auto overscroll-contain px-3 py-2">
          {hasOlder && (
            <div className="flex justify-center py-2 text-micro text-text-muted">
              {loadingOlder ? <LoaderCircle aria-label="Loading older messages" size={14} className="animate-spin motion-reduce:animate-none" /> : <span>Scroll up for older messages</span>}
            </div>
          )}
          {status === "loading" && <p className="py-6 text-center text-caption text-text-muted">Loading messages…</p>}
          {status === "error" && (
            <p className="py-6 text-center text-caption text-text-muted">
              Couldn&apos;t load messages.{" "}
              <button type="button" className="text-pink-400 underline underline-offset-2" onClick={() => useChatStore.getState().retryLoad?.()}>
                Try again
              </button>
            </p>
          )}
          {status === "ready" && messages.length === 0 && <p className="py-8 text-center text-caption text-text-muted">Say hi to {partnerName} ❤️</p>}
          <MessageList messages={messages} meId={meId} partnerName={partnerName} />
        </div>
        {showJump && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black-700/95 px-3 py-1 text-micro text-white-soft shadow"
          >
            <ArrowDown aria-hidden="true" size={12} /> New messages
          </button>
        )}
      </div>

      <form
        className="border-t border-[var(--border-subtle)] p-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-[var(--radius-md)] bg-black-950/60 py-1 pr-1 pl-3 focus-within:ring-1 focus-within:ring-green-500/70">
          <label htmlFor={`${panelId}-input`} className="sr-only">
            Message {partnerName}
          </label>
          <textarea
            id={`${panelId}-input`}
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH + 50}
            enterKeyHint="send"
            placeholder={`Message ${partnerName}…`}
            onFocus={onComposerFocus}
            onChange={(event) => {
              setDraft(event.target.value);
              if (composerError) setComposerError(null);
            }}
            onKeyDown={onKeyDown}
            className="field-sizing-content max-h-24 min-h-9 flex-1 resize-none bg-transparent py-2 text-body leading-snug text-white-soft outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!draft.trim() || remaining < 0}
            className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-green-600 text-white transition-[opacity,transform] active:scale-95 disabled:bg-transparent disabled:text-text-muted"
          >
            <SendHorizontal aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
        </div>
        {(composerError || remaining < 200) && (
          <p role={composerError ? "alert" : undefined} className={`px-1 pt-1 text-micro ${composerError || remaining < 0 ? "text-pink-400" : "text-text-muted"}`}>
            {composerError ? CHAT_ERROR_COPY[composerError] ?? CHAT_ERROR_COPY.unknown : `${remaining} characters left`}
          </p>
        )}
      </form>
    </section>
  );
}

function MessageList({ messages, meId, partnerName }) {
  const rows = [];
  let previous = null;
  for (const message of messages) {
    const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
    if (newDay) {
      rows.push(
        <div key={`day-${message.id}`} className="flex justify-center py-2">
          <span className="micro-caps text-text-muted">{dayLabel(message.createdAt)}</span>
        </div>,
      );
    }
    if (message.type === "system") {
      rows.push(
        <p key={message.id} className="py-1.5 text-center text-caption text-pink-400/90">
          {message.content}
        </p>,
      );
    } else {
      const mine = message.senderId === meId;
      const startsGroup = newDay || !previous || previous.type === "system" || previous.senderId !== message.senderId || message.createdAt - previous.createdAt > 5 * 60_000;
      rows.push(<MessageRow key={message.clientId ?? message.id} message={message} mine={mine} startsGroup={startsGroup} senderName={mine ? "You" : partnerName} />);
    }
    previous = message;
  }
  return rows;
}

function MessageRow({ message, mine, startsGroup, senderName }) {
  const failed = message.status === "failed";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} ${startsGroup ? "mt-2.5" : "mt-0.5"}`}>
      {startsGroup && (
        <div className={`mb-0.5 flex items-baseline gap-2 px-1 text-micro ${mine ? "flex-row-reverse" : ""}`}>
          <span className={`font-semibold ${mine ? "text-green-500" : "text-pink-400"}`}>{senderName}</span>
          <time dateTime={new Date(message.createdAt).toISOString()} className="text-text-muted">
            {timeFormat.format(message.createdAt)}
          </time>
        </div>
      )}
      <p
        className={`max-w-[88%] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-body leading-snug break-words whitespace-pre-wrap ${
          mine ? "bg-green-700/45 text-white-soft" : "border-l-2 border-pink-400/70 bg-black-700/70 text-white-soft"
        } ${message.status === "sending" ? "opacity-60" : ""} ${failed ? "outline outline-1 outline-red-500/60" : ""}`}
      >
        {message.content}
      </p>
      {message.status === "sending" && <span className="px-1 text-micro text-text-muted">Sending…</span>}
      {failed && (
        <span role="alert" className="flex items-center gap-2 px-1 pt-0.5 text-micro text-pink-400">
          {CHAT_ERROR_COPY[message.error] ?? "Message failed to send."}
          <button type="button" className="font-semibold text-white-soft underline underline-offset-2" onClick={() => useChatStore.getState().retry(message.clientId)}>
            Retry
          </button>
          <button type="button" className="text-text-muted underline underline-offset-2" onClick={() => useChatStore.getState().discard(message.clientId)}>
            Remove
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * Space taken by the on-screen keyboard (mobile), from the VisualViewport API,
 * so the composer stays above the keyboard instead of hiding behind it.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => {
      const covered = window.innerHeight - (viewport.height + viewport.offsetTop);
      setInset(covered > 80 ? covered + 8 : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
