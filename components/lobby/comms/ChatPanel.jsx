"use client";

import { ArrowDown, LoaderCircle, Reply, SendHorizontal, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CHAT_ERROR_COPY, MAX_MESSAGE_LENGTH, canReplyTo, quoteSnippet, resolveReply } from "@/lib/chat/messages";
import { useChatStore } from "@/store/chatStore";
import { MessageRow, TypingBubble } from "./MessageRow";

const NEAR_BOTTOM_PX = 48;
const NEAR_TOP_PX = 60;
const HIGHLIGHT_MS = 1400;
const JUMP_MAX_PAGES = 20; // how far back a quote tap will load to find its original
let savedScroll = null; // { top, atBottom } — survives closing/reopening the panel

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

function dayLabel(ms) {
  const day = new Date(ms).toDateString();
  const today = new Date();
  if (day === today.toDateString()) return "Today";
  if (day === new Date(today.getTime() - 86_400_000).toDateString()) return "Yesterday";
  return dateFormat.format(ms);
}

/**
 * The chat panel: floats over the world's bottom-right corner — and over an
 * open game, so the couple can keep talking while they play. Never navigates
 * away. Text is always rendered as text (React escapes it; no HTML injection).
 * Swipe a message (or use its reply button) to answer it; "… is typing" shows
 * in the header and as dots at the end of the list.
 */
export function ChatPanel({ meId, partnerName, onClose, onComposerFocus, panelId }) {
  const status = useChatStore((state) => state.status);
  const connection = useChatStore((state) => state.connection);
  const messages = useChatStore((state) => state.messages);
  const hasOlder = useChatStore((state) => state.hasOlder);
  const loadingOlder = useChatStore((state) => state.loadingOlder);
  const replies = useChatStore((state) => state.replies);
  const replyingTo = useChatStore((state) => state.replyingTo);
  const quoted = useChatStore((state) => state.quoted);
  const partnerTyping = useChatStore((state) => state.partnerTyping);
  const reduceMotion = useReducedMotion();
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const anchor = useRef(null); // keeps the view still when older messages load above
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
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
    return () => useChatStore.getState().stopTyping();
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

  // The typing dots and the reply preview change the space at the bottom: stay pinned.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && atBottom.current) list.scrollTop = list.scrollHeight;
  }, [partnerTyping, replyingTo]);

  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

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

  const startReply = useCallback((message) => {
    if (useChatStore.getState().startReply(message)) inputRef.current?.focus({ preventScroll: true });
  }, []);

  /** A quote was tapped: scroll its original into view (loading older pages if needed) and glow it. */
  const jumpTo = useCallback(
    async (id) => {
      const list = listRef.current;
      if (!list) return;
      const find = () => list.querySelector(`[data-message-id="${id}"]`);
      let target = find();
      for (let page = 0; !target && page < JUMP_MAX_PAGES; page += 1) {
        const store = useChatStore.getState();
        if (!store.hasOlder || store.loadingOlder) break;
        anchor.current = { top: list.scrollTop, height: list.scrollHeight };
        atBottom.current = false;
        await store.loadOlder();
        await nextFrame();
        anchor.current = null; // already used, or nothing loaded
        target = find();
      }
      if (!target) return;
      const listBox = list.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      const top = list.scrollTop + (box.top - listBox.top) - Math.max(0, (list.clientHeight - box.height) / 2);
      list.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
      setHighlightId(id);
    },
    [reduceMotion],
  );

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
      if (useChatStore.getState().replyingTo) useChatStore.getState().cancelReply();
      else onClose();
    }
  };

  const remaining = MAX_MESSAGE_LENGTH - [...draft].length;
  const offline = connection !== "live";

  return (
    <section
      id={panelId}
      aria-label={`Chat with ${partnerName}`}
      style={keyboardInset ? { bottom: keyboardInset } : undefined}
      className="chat-panel panel pointer-events-auto fixed z-40 flex flex-col overflow-hidden rounded-[var(--radius-lg)] shadow-[0_18px_48px_rgba(0,0,0,0.45)] [animation:panel-in_180ms_var(--ease-out-soft)] motion-reduce:animate-none"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-2 pr-1.5 pl-4 short:py-0.5 short:pl-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${offline ? "bg-text-muted animate-pulse-live" : "bg-blue-400"}`} />
          <h2 className="truncate text-caption font-semibold text-white-soft">{partnerName}</h2>
          {partnerTyping ? (
            <span className="shrink-0 text-micro text-green-500">typing…</span>
          ) : (
            offline && <span className="text-micro text-text-muted">{connection === "closed" ? "offline" : "reconnecting…"}</span>
          )}
        </div>
        <button
          type="button"
          aria-label="Close chat"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-black-700 hover:text-white-soft short:size-8"
        >
          <X aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" className="h-full overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-2 short:py-1">
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
          <MessageList
            messages={messages}
            meId={meId}
            partnerName={partnerName}
            replies={replies}
            quoted={quoted}
            highlightId={highlightId}
            onReply={startReply}
            onQuote={jumpTo}
          />
          {partnerTyping && <TypingBubble name={partnerName} />}
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
        className="border-t border-[var(--border-subtle)] p-2 short:p-1"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {replyingTo && <ReplyPreview message={replyingTo} name={replyingTo.senderId === meId ? "You" : partnerName} mine={replyingTo.senderId === meId} />}
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
              useChatStore.getState().noteTyping(event.target.value);
              if (composerError) setComposerError(null);
            }}
            onKeyDown={onKeyDown}
            className="field-sizing-content max-h-24 min-h-9 flex-1 resize-none bg-transparent py-2 text-body leading-snug text-white-soft outline-none placeholder:text-text-muted short:max-h-14 short:min-h-8 short:py-1.5 short:text-caption"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!draft.trim() || remaining < 0}
            className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-green-600 text-white short:size-8 transition-[opacity,transform] active:scale-95 disabled:bg-transparent disabled:text-text-muted"
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

function MessageList({ messages, meId, partnerName, replies, quoted, highlightId, onReply, onQuote }) {
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
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
      const quote = replies ? resolveReply(message, byId, quoted) : null;
      const quoteMine = quote?.state === "ready" && quote.senderId === meId;
      rows.push(
        <MessageRow
          key={message.clientId ?? message.id}
          message={message}
          mine={mine}
          startsGroup={startsGroup}
          senderName={mine ? "You" : partnerName}
          quote={quote}
          quoteName={quoteMine ? "You" : partnerName}
          quoteMine={quoteMine}
          canReply={replies && canReplyTo(message)}
          onReply={onReply}
          onQuote={onQuote}
          highlighted={highlightId === message.id}
        />,
      );
    }
    previous = message;
  }
  return rows;
}

/** Above the composer while answering a message: who and what, with ✕ to cancel. */
function ReplyPreview({ message, name, mine }) {
  return (
    <div
      className={`mb-1.5 flex items-center gap-2 rounded-[var(--radius-sm)] border-l-2 bg-black-950/60 py-1 pr-1 pl-2 [animation:panel-in_160ms_var(--ease-out-soft)] motion-reduce:animate-none short:mb-1 short:py-0 ${mine ? "border-green-500" : "border-pink-400"}`}
    >
      <Reply aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
      <p className="min-w-0 flex-1 leading-tight short:flex short:items-baseline short:gap-1.5">
        <span className={`block shrink-0 text-micro font-semibold ${mine ? "text-green-500" : "text-pink-400"}`}>
          <span className="sr-only">Replying to </span>
          {name}
        </span>
        <span className="block truncate text-caption text-text-secondary">{quoteSnippet(message.content)}</span>
      </p>
      <button
        type="button"
        aria-label="Cancel reply"
        onClick={() => useChatStore.getState().cancelReply()}
        className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-muted transition-colors hover:bg-black-700 hover:text-white-soft short:size-7"
      >
        <X aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
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
