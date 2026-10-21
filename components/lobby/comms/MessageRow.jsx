"use client";

import { Reply } from "lucide-react";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useRef } from "react";
import { CHAT_ERROR_COPY } from "@/lib/chat/messages";
import { SWIPE, swipeArmed, swipeAxis, swipeOffset } from "@/lib/chat/swipe";
import { useChatStore } from "@/store/chatStore";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * One chat message. Replying, WhatsApp-style:
 *   touch    swipe the bubble right. It follows the finger (capped), a reply arrow
 *            fades in, and past the trigger point the phone ticks; letting go
 *            there starts the reply. Vertical movement is left to scrolling.
 *   desktop  a reply button beside the bubble on hover (or keyboard focus).
 * A reply shows its quoted original above the text; tapping the quote jumps there.
 */
export function MessageRow({ message, mine, startsGroup, senderName, quote, quoteName, quoteMine, canReply, onReply, onQuote, highlighted }) {
  const failed = message.status === "failed";
  const reduce = useReducedMotion();
  const { pull, handlers } = useSwipeToReply({ enabled: canReply, onReply: () => onReply(message), reduce });
  const arrowOpacity = useTransform(pull, [14, SWIPE.trigger], [0, 1]);
  const arrowScale = useTransform(pull, [14, SWIPE.trigger], [0.5, 1]);

  return (
    <div data-message-id={message.status === "sent" ? message.id : undefined} className={`flex flex-col ${mine ? "items-end" : "items-start"} ${startsGroup ? "mt-2.5" : "mt-0.5"}`}>
      {startsGroup && (
        <div className={`mb-0.5 flex items-baseline gap-2 px-1 text-micro ${mine ? "flex-row-reverse" : ""}`}>
          <span className={`font-semibold ${mine ? "text-green-500" : "text-pink-400"}`}>{senderName}</span>
          <time dateTime={new Date(message.createdAt).toISOString()} className="text-text-muted">
            {timeFormat.format(message.createdAt)}
          </time>
        </div>
      )}
      <div className={`group/row flex max-w-[88%] items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
        <div className="relative min-w-0">
          {canReply && (
            <m.span
              aria-hidden="true"
              style={{ opacity: arrowOpacity, scale: arrowScale }}
              className="absolute top-1/2 left-1 -mt-3 grid size-6 place-items-center rounded-full bg-black-700 text-white-soft"
            >
              <Reply size={14} strokeWidth={2} />
            </m.span>
          )}
          <m.div
            style={{ x: pull }}
            {...handlers}
            className={`relative rounded-[var(--radius-sm)] px-2.5 py-1.5 text-white-soft ${canReply ? "touch-pan-y" : ""} ${
              mine ? "bg-green-700/45" : "border-l-2 border-pink-400/70 bg-black-700/70"
            } ${message.status === "sending" ? "opacity-60" : ""} ${failed ? "outline outline-1 outline-red-500/60" : ""}`}
          >
            {quote && <Quote quote={quote} name={quoteName} mine={quoteMine} onOpen={onQuote} />}
            <p className="text-body leading-snug break-words whitespace-pre-wrap">{message.content}</p>
            {/* Brief glow when a quote jumps here. */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 rounded-[inherit] bg-white/15 ring-1 ring-white/40 transition-opacity duration-700 motion-reduce:transition-none ${highlighted ? "opacity-100" : "opacity-0"}`}
            />
          </m.div>
        </div>
        {canReply && (
          <button
            type="button"
            aria-label={mine ? "Reply to your message" : `Reply to ${senderName}`}
            onClick={() => onReply(message)}
            className="pointer-events-none grid size-7 shrink-0 place-items-center rounded-full text-text-muted opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 hover:bg-black-700 hover:text-white-soft focus-visible:pointer-events-auto focus-visible:opacity-100 short:size-6"
          >
            <Reply aria-hidden="true" size={15} strokeWidth={1.75} />
          </button>
        )}
      </div>
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

/** The quoted original inside a reply. A button: it jumps to the original. */
function Quote({ quote, name, mine, onOpen }) {
  const missing = quote.state === "missing";
  const text = quote.state === "ready" ? quote.snippet : missing ? "Original message unavailable" : "…";
  return (
    <button
      type="button"
      disabled={missing}
      onClick={() => onOpen(quote.id)}
      className={`mb-1 block w-full min-w-0 rounded-[var(--radius-xs)] border-l-2 bg-black-950/40 px-2 py-1 text-left transition-colors enabled:hover:bg-black-950/60 ${mine ? "border-green-500" : "border-pink-400"}`}
    >
      <span className="sr-only">In reply to </span>
      {!missing && <span className={`block truncate text-micro font-semibold ${mine ? "text-green-500" : "text-pink-400"}`}>{name}</span>}
      <span className={`line-clamp-2 text-caption leading-snug break-words short:line-clamp-1 ${missing ? "text-text-muted italic" : "text-text-secondary"}`}>{text}</span>
    </button>
  );
}

/** "… is typing": three dots in a partner-style bubble at the end of the list. */
export function TypingBubble({ name }) {
  const reduce = useReducedMotion();
  return (
    <div className="mt-2 flex items-start" title={`${name} is typing`}>
      <div aria-hidden="true" className="flex items-center gap-1 rounded-[var(--radius-sm)] border-l-2 border-pink-400/70 bg-black-700/70 px-3 py-2.5 short:py-2">
        {[0, 1, 2].map((i) => (
          <m.span
            key={i}
            className="size-1.5 rounded-full bg-text-secondary"
            initial={{ opacity: reduce ? 0.8 : 0.4 }}
            animate={reduce ? undefined : { opacity: [0.4, 1, 0.4], y: [0, -2.5, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Touch swipe-to-reply on a bubble: own pointer handling (not motion's drag), so
 * the axis is locked from the first few pixels and a vertical scroll never moves
 * the bubble. `touch-action: pan-y` on the bubble leaves vertical panning to the
 * browser. Mouse pointers are ignored (desktop has the reply button and keeps
 * text selection). Reduced motion: the bubble still follows the finger (it's
 * direct manipulation) but snaps back instead of springing.
 */
function useSwipeToReply({ enabled, onReply, reduce }) {
  const pull = useMotionValue(0);
  const gesture = useRef(null);
  const swiped = useRef(false);

  if (!enabled) return { pull, handlers: {} };

  const finish = (event, completed) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.id) return;
    gesture.current = null;
    if (g.axis !== "x") return;
    swiped.current = true; // the click that may follow isn't a tap on the quote
    if (reduce) pull.set(0);
    else animate(pull, 0, { type: "spring", stiffness: 620, damping: 34, mass: 0.7 });
    if (completed && g.armed) onReply();
  };

  return {
    pull,
    handlers: {
      onPointerDown(event) {
        swiped.current = false;
        if (event.pointerType === "mouse" || !event.isPrimary) return;
        pull.stop();
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, armed: false };
      },
      onPointerMove(event) {
        const g = gesture.current;
        if (!g || event.pointerId !== g.id) return;
        const dx = event.clientX - g.x;
        if (!g.axis) {
          g.axis = swipeAxis(dx, event.clientY - g.y);
          if (!g.axis) return;
          if (g.axis !== "x") {
            gesture.current = null; // scrolling (or a leftward swipe): not ours
            return;
          }
          capture(event);
        }
        const offset = swipeOffset(dx);
        pull.set(offset);
        const armed = swipeArmed(offset);
        if (armed && !g.armed) haptic();
        g.armed = armed;
      },
      onPointerUp: (event) => finish(event, true),
      onPointerCancel: (event) => finish(event, false),
      onClickCapture(event) {
        if (!swiped.current) return;
        swiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}

/** Keeps the moves coming to the bubble if the finger slides off it. Optional: it throws if the pointer is already gone. */
function capture(event) {
  try {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  } catch {
    // The swipe still works from the bubble's own events.
  }
}

function haptic() {
  try {
    navigator.vibrate?.(12);
  } catch {
    // Not allowed here (no user activation yet, or unsupported): the arrow still says it.
  }
}
