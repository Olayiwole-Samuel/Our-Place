"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Check, CircleHelp, Home, LogOut, RotateCcw } from "lucide-react";
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { shortName } from "@/lib/couple/names";
import { gameRegistry } from "@/lib/game/catalog";
import { guideFor } from "@/lib/game/guides";
import { loadGameClient } from "@/lib/game/loader";
import { playSound } from "@/lib/ui/sounds";
import { useChatStore } from "@/store/chatStore";
import { useGameStore, sessionPhase } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import { GameGuide } from "./GameGuide";
import { useWorldStore } from "@/store/worldStore";

/**
 * Everything a game needs around it, so individual games only render their
 * board/state (the "game shell"):
 *
 *   invite    partner started a game → Join / Not now
 *   lobby     launch screen: game, both players, ready states, waiting copy
 *   playing   the game's own client (lazy-loaded) + header, connection,
 *             partner presence, rejected-move feedback, leave
 *   result    outcome → Play again / Return to Our Place
 *
 * It floats over the living room: the room, both characters (and their emotes),
 * chat and voice stay present the whole time — chat opens over (or, on wide
 * screens, beside) the game, so nobody has to leave a game to talk. Chat/voice/emotes are the Phase 4
 * systems in the HUD — games don't get their own.
 */
export function GameStage({ me, partner, onEmote, hints }) {
  const session = useGameStore((state) => state.session);
  const phase = sessionPhase(session, me.id);
  const definition = session ? gameRegistry.get(session.gameId) : null;
  const chatOpen = useChatStore((state) => state.open);

  // While a game is open the world doesn't take movement keys (typing/clicking
  // in the game must not walk the character); characters stay visible.
  useEffect(() => {
    useWorldStore.getState().setInGame?.(phase === "playing" || phase === "lobby");
  }, [phase]);

  return (
    <AnimatePresence>
      {phase === "invite" && <Invite key="invite" partner={partner} definition={definition} />}
      {(phase === "lobby" || phase === "playing" || phase === "result") && definition && (
        <m.div
          key={`stage-${session.id}`}
          // Chat open: wide screens move the game left so the two sit side by side.
          data-chat={chatOpen ? "true" : "false"}
          className="game-stage pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black-950/35 safe-inset"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
        >
          <m.section
            role="dialog"
            aria-modal="false"
            aria-label={definition.name}
            data-layout={definition.layout}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="game-shell panel pointer-events-auto relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
          >
            {phase === "lobby" && <Launch me={me} partner={partner} definition={definition} session={session} />}
            {(phase === "playing" || phase === "result") && <Shell me={me} partner={partner} definition={definition} session={session} phase={phase} onEmote={onEmote} hints={hints} />}
          </m.section>
        </m.div>
      )}
    </AnimatePresence>
  );
}

const firstName = (profile, fallback) => shortName(profile, fallback);

function Invite({ partner, definition }) {
  const pending = useGameStore((state) => state.pending);
  const name = firstName(partner, "Your partner");
  return (
    <m.div
      role="alertdialog"
      aria-label={`${name} wants to play ${definition?.name ?? "a game"}`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      className="game-invite panel pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-[var(--radius-lg)] py-2.5 pr-2.5 pl-3"
    >
      <ProfileAvatar profile={partner} size={32} ring="pink" />
      <p className="text-caption text-white-soft">
        <span aria-hidden="true">❤️ </span>
        <span className="font-semibold">{name}</span> wants to play <span className="font-semibold">{definition?.name ?? "a game"}</span>.
      </p>
      <button type="button" onClick={() => useGameStore.getState().join()} disabled={pending === "join"} className="min-h-10 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white">
        {pending === "join" ? "Joining…" : "Join"}
      </button>
      <button type="button" onClick={() => useGameStore.getState().decline()} className="min-h-10 rounded-[var(--radius-md)] px-3 text-caption text-text-secondary hover:text-white-soft">
        Not now
      </button>
    </m.div>
  );
}

function PlayerChip({ profile, label, ready, waiting }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <ProfileAvatar profile={profile} size={52} ring={label === "You" ? "green" : "pink"} />
      <span className="text-caption font-semibold text-white-soft">{label}</span>
      <span className={`flex items-center gap-1 text-micro tracking-normal ${ready ? "text-green-500" : "text-text-muted"}`}>
        {ready ? <Check aria-hidden="true" size={12} /> : null}
        {waiting ? "Not joined yet" : ready ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}

function Launch({ me, partner, definition, session }) {
  const pending = useGameStore((state) => state.pending);
  const error = useGameStore((state) => state.error);
  const partnerStatus = useWorldStore((state) => state.partner.status);
  const partnerName = firstName(partner, "Your partner");
  const iAmReady = session.ready.includes(me.id);
  const partnerJoined = session.players.includes(partner.id);
  const partnerReady = session.ready.includes(partner.id);
  const starting = session.status === "ready";
  const [guideOpen, setGuideOpen] = useState(false);

  const line = starting
    ? "Both ready — starting…"
    : partnerStatus !== "online"
      ? `${partnerName} isn't here yet.`
      : !partnerJoined
        ? `Waiting for ${partnerName} to join…`
        : !partnerReady
          ? `Waiting for ${partnerName}…`
          : "Tap Ready when you are.";

  return (
    // Scrolls on short landscape phones, so Ready and Cancel are always reachable.
    <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-6 py-6 text-center short:gap-3 short:py-4">
      <div>
        <p className="micro-caps text-text-muted">Game</p>
        <h2 className="text-subheading font-semibold text-white-soft">{definition.name}</h2>
        <p className="text-caption text-text-secondary">{definition.description}</p>
        {guideFor(definition.id) && (
          <button type="button" onClick={() => setGuideOpen(true)} className="mt-1 inline-flex items-center gap-1 text-micro tracking-normal text-pink-400 underline underline-offset-2">
            <CircleHelp aria-hidden="true" size={12} /> How to play
          </button>
        )}
      </div>
      <div className="flex items-start gap-8" aria-label="Players">
        <PlayerChip profile={me} label="You" ready={iAmReady} />
        <span aria-hidden="true" className="mt-5 text-pink-400">+</span>
        <PlayerChip profile={partner} label={partnerName} ready={partnerReady} waiting={!partnerJoined} />
      </div>
      <HeadToHead definition={definition} me={me.id} partner={partner.id} partnerName={partnerName} />
      <p role="status" aria-live="polite" className="text-caption text-text-secondary">
        {line}
      </p>
      {error && error.code !== "session_open" && (
        <p role="alert" className="text-caption text-pink-400">
          {error.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending === "ready" || starting}
          onClick={() => useGameStore.getState().setReady(!iAmReady)}
          aria-pressed={iAmReady}
          className={`min-h-11 min-w-32 rounded-[var(--radius-md)] px-5 text-body font-semibold transition-colors ${iAmReady ? "border border-green-500/60 text-green-500" : "bg-green-600 text-white"}`}
        >
          {iAmReady ? "Ready ✓" : "Ready"}
        </button>
        <button
          type="button"
          onClick={async () => {
            await useGameStore.getState().leave();
            useGameStore.getState().dismiss(); // the one who cancels goes straight back to the room
          }}
          disabled={pending === "leave"}
          className="min-h-11 rounded-[var(--radius-md)] px-4 text-body text-text-secondary hover:text-white-soft"
        >
          Cancel
        </button>
      </div>
      {guideOpen && <GameGuide definition={definition} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

/**
 * Your all-time record against each other in this game ("You 7 · 9 King"),
 * from the bookshelf's numbers (couple_trophies(), counted by the database).
 * Re-read when it mounts, so the finish screen shows the game just won.
 * Competitive games only, and only once there's a winner to count.
 */
function HeadToHead({ definition, me, partner, partnerName, refreshKey = null }) {
  const trophies = useRoomStore((state) => state.trophies);
  useEffect(() => {
    if (definition.mode === "competitive") useRoomStore.getState().refresh("trophies");
  }, [definition.id, definition.mode, refreshKey]);
  if (definition.mode !== "competitive" || !trophies) return null;
  const wins = (id) => (trophies.wins ?? []).filter((row) => row.game_id === definition.id && row.user_id === id).reduce((sum, row) => sum + Number(row.wins), 0);
  const [mine, theirs] = [wins(me), wins(partner)];
  if (!mine && !theirs) return null;
  const lead = mine === theirs ? null : mine > theirs ? "me" : "partner";
  return (
    <p aria-label={`${definition.name} record: you ${mine}, ${partnerName} ${theirs}`} className="flex items-center gap-2 rounded-full bg-black-800/80 px-3 py-1 text-caption text-text-secondary">
      <span className="micro-caps text-text-muted">Head to head</span>
      <span className={lead === "me" ? "font-semibold text-green-500" : "text-white-soft"}>You {mine}</span>
      <span aria-hidden="true" className="text-text-muted">·</span>
      <span className={lead === "partner" ? "font-semibold text-pink-400" : "text-white-soft"}>
        {theirs} {partnerName}
      </span>
    </p>
  );
}

/** A rejected move ("That square is taken."): a small toast at the top of the game that clears itself. */
function RejectionToast() {
  const rejection = useGameStore((state) => state.rejection);
  useEffect(() => {
    if (!rejection) return undefined;
    const timer = setTimeout(() => useGameStore.getState().clearRejection(), 3500);
    return () => clearTimeout(timer);
  }, [rejection]);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[3.25rem] z-30 flex justify-center px-3 short:top-11">
      <AnimatePresence>
        {rejection && (
          <m.p
            key={rejection}
            role="alert"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="max-w-[min(28rem,92%)] rounded-full border border-pink-400/40 bg-black-950/95 px-3.5 py-1.5 text-center text-caption text-pink-400 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          >
            {rejection}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The finish: confetti and a bright chime when you win (hearts when you finish
 * something together), a soft note when your partner wins. Once per game.
 */
function Celebration({ kind }) {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(true);
  useEffect(() => {
    playSound(kind === "lost" ? "lose" : kind === "draw" ? "move" : "win");
    const timer = setTimeout(() => setOn(false), 4200);
    return () => clearTimeout(timer);
  }, [kind]);
  const pieces = useMemo(() => {
    let seed = kind.length * 97 + 13;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const glyphs = kind === "together" ? ["♥", "♥", "✦"] : ["●", "■", "▲", "♥", "✦"];
    const colors = kind === "together" ? ["#ff8fb1", "#ff4f7e", "#ffd1e0"] : ["#7ed957", "#ffd166", "#ff8fb1", "#7dd3fc", "#ffffff"];
    return Array.from({ length: 42 }, (_, i) => ({ left: random() * 100, delay: random() * 0.9, duration: 2.2 + random() * 1.6, size: 8 + random() * 10, spin: (random() - 0.5) * 720, drift: (random() - 0.5) * 140, glyph: glyphs[i % glyphs.length], color: colors[i % colors.length] }));
  }, [kind]);
  if (!on || reduced || kind === "lost" || kind === "draw") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {pieces.map((piece, i) => (
        <span key={i} className="game-confetti" style={{ left: `${piece.left}%`, fontSize: piece.size, color: piece.color, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, "--spin": `${piece.spin}deg`, "--drift": `${piece.drift}px` }}>
          {piece.glyph}
        </span>
      ))}
    </div>
  );
}

/**
 * One lazy component per game, created once and reused: a fresh lazy() per
 * mount would start out "unresolved" every time and suspend forever on
 * re-mount (e.g. Play again), even though the module is already loaded.
 */
const gameViews = new Map();
function gameViewFor(definition) {
  if (!gameViews.has(definition.id)) gameViews.set(definition.id, lazy(() => loadGameClient(definition)));
  return gameViews.get(definition.id);
}

/**
 * Keeps a game's own code (or its chunk failing to download) from taking the
 * world down with it: calm copy, Retry, and a way home.
 */
class GameErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="grid place-items-center gap-3 p-8 text-center">
          <p className="text-body text-white-soft">We couldn&apos;t open this game.</p>
          <div className="flex gap-2">
            <button type="button" className="min-h-10 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white" onClick={() => this.setState({ failed: false })}>
              Retry
            </button>
            <button type="button" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 text-caption text-white-soft" onClick={this.props.onReturn}>
              Return to Our Place
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const RESULT_COPY = {
  win: (session, me, partnerName) => (session.winnerId === me ? "You won! 🎉" : `${partnerName} won`),
  draw: () => "It's a draw",
  completed: (session) => session.result?.summary?.headline ?? "Done together ❤️",
  failed: () => "Not this time",
  abandoned: (session, me, partnerName) => (session.result?.summary?.by === me ? "You left the game" : `${partnerName} left the game`),
  cancelled: () => "This game didn't start.",
};

/**
 * The supporting line under the result. A game may give one line for both
 * players (`summary.line`) or one per side (`summary.lines.winner/loser`, where
 * "{winner}" is replaced by the winner's name as this player knows them).
 */
function resultLine(session, me, partnerName) {
  const summary = session.result?.summary;
  const lines = summary?.lines;
  if (lines && session.winnerId) {
    return session.winnerId === me ? lines.winner : lines.loser?.replace("{winner}", partnerName);
  }
  // Only a sentence: some games keep data under `line` (Tic Tac Toe: the winning cells).
  return typeof summary?.line === "string" ? summary.line : null;
}

/** Both players on the finish screen: the winner is marked, with their win streak (from the server). */
function WinnerRow({ me, partner, session, partnerName }) {
  return (
    <div className="flex items-start gap-6" aria-label="Players">
      {[
        [me, "You"],
        [partner, partnerName],
      ].map(([profile, label]) => {
        const won = session.winnerId === profile.id;
        const streak = session.streaks?.[profile.id]?.current ?? 0;
        return (
          <div key={profile.id} className="flex flex-col items-center gap-1">
            <span className="relative">
              <ProfileAvatar profile={profile} size={40} ring={label === "You" ? "green" : "pink"} />
              {won && (
                <span aria-hidden="true" className="absolute -top-2 -right-2 text-body">
                  🏆
                </span>
              )}
            </span>
            <span className="text-caption text-white-soft">
              {label}
              {won ? " · winner" : ""}
            </span>
            {won && streak > 1 && <span className="text-micro tracking-normal text-pink-400">🔥 {streak} wins in a row</span>}
          </div>
        );
      })}
    </div>
  );
}

function Shell({ me, partner, definition, session, phase, onEmote, hints }) {
  const view = useGameStore((state) => state.view);
  const pending = useGameStore((state) => state.pending);
  const error = useGameStore((state) => state.error);
  const connection = useGameStore((state) => state.connection);
  const partnerStatus = useWorldStore((state) => state.partner.status);
  const partnerName = firstName(partner, "Your partner");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const GameView = gameViewFor(definition);

  // A win is celebrated with the existing emote system: the winner's full-body
  // character dances, and the partner sees it (same realtime emote pipeline).
  const celebrated = useRef(null);
  useEffect(() => {
    if (phase !== "result" || celebrated.current === session.id) return;
    celebrated.current = session.id;
    if (session.result?.outcome === "win" && session.winnerId === me.id) onEmote?.("dance");
  }, [phase, session, me.id, onEmote]);

  const outcome = session.status === "cancelled" ? "cancelled" : (session.result?.outcome ?? null);
  const celebration = outcome === "win" ? (session.winnerId === me.id ? "won" : "lost") : outcome === "completed" ? "together" : outcome === "draw" ? "draw" : null;
  const playAgain = async () => {
    const gameId = session.gameId;
    useGameStore.getState().dismiss();
    await useGameStore.getState().launch(gameId);
  };

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] py-2 pr-2 pl-4">
        <h2 className="flex-1 truncate text-caption font-semibold text-white-soft">{definition.name}</h2>
        {connection !== "live" && (
          <span role="status" className="shrink-0 text-micro tracking-normal text-text-muted">
            <span className="hidden sm:inline">Connection interrupted. </span>Reconnecting…
          </span>
        )}
        <span className="flex min-w-0 shrink items-center gap-1.5 truncate text-micro tracking-normal whitespace-nowrap text-text-secondary">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${partnerStatus === "online" ? "bg-pink-400" : "bg-text-muted/60"}`} />
          {partnerName} {partnerStatus === "online" ? "is here" : partnerStatus === "away" ? "· reconnecting" : "· away"}
        </span>
        {guideFor(definition.id) && (
          <button type="button" aria-label={`How to play ${definition.name}`} title="How to play" onClick={() => setGuideOpen(true)} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft">
            <CircleHelp aria-hidden="true" size={16} />
          </button>
        )}
        {phase === "playing" && (
          <button type="button" aria-label="Leave game" onClick={() => setConfirmLeave(true)} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft">
            <LogOut aria-hidden="true" size={16} />
          </button>
        )}
      </header>

      {/* One scroll area: on a short phone the result (with its buttons, first)
          and the game can always be scrolled into view. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {phase === "result" && (
          <section aria-label="Result" className="flex flex-col items-center gap-3 border-b border-[var(--border-subtle)] p-4 short:gap-2 short:p-3">
            {outcome === "win" && session.result?.summary?.headline && <p className="micro-caps -mb-2 text-pink-400">{session.result.summary.headline}</p>}
            <p role="status" aria-live="polite" className="text-subheading font-semibold text-white-soft">
              {(RESULT_COPY[outcome] ?? RESULT_COPY.completed)(session, me.id, partnerName)}
            </p>
            {(outcome === "completed" || outcome === "win") && resultLine(session, me.id, partnerName) && <p className="-mt-2 text-caption text-text-secondary">{resultLine(session, me.id, partnerName)}</p>}
            {outcome === "win" && <WinnerRow me={me} partner={partner} session={session} partnerName={partnerName} />}
            {(outcome === "win" || outcome === "draw") && <HeadToHead definition={definition} me={me.id} partner={partner.id} partnerName={partnerName} refreshKey={session.id} />}
            <div className="flex gap-2">
              {outcome !== "abandoned" && (
                <button type="button" onClick={playAgain} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-green-600 px-4 text-body font-semibold text-white">
                  <RotateCcw aria-hidden="true" size={16} /> {outcome === "cancelled" ? "Try again" : "Play again"}
                </button>
              )}
              <button type="button" onClick={() => useGameStore.getState().dismiss()} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 text-body text-white-soft">
                <Home aria-hidden="true" size={16} /> Return to Our Place
              </button>
            </div>
          </section>
        )}
        <div className="game-body relative p-4">
          {view ? (
            <GameErrorBoundary
              onReturn={async () => {
                if (phase === "playing") await useGameStore.getState().leave();
                useGameStore.getState().dismiss();
              }}
            >
              <Suspense fallback={<p className="py-10 text-center text-caption text-text-muted">Setting up your game…</p>}>
                <GameView
                  view={view}
                  me={me.id}
                  partner={partner.id}
                  names={{ [me.id]: "You", [partner.id]: partnerName }}
                  profiles={{ [me.id]: me, [partner.id]: partner }}
                  status={session.status}
                  result={session.result}
                  busy={pending === "action"}
                  act={(type, payload) => useGameStore.getState().act(type, payload)}
                  hints={hints}
                />
              </Suspense>
            </GameErrorBoundary>
          ) : (
            // A game that ended early (left or cancelled) has no board; the result above says it all.
            phase !== "result" && <p className="py-10 text-center text-caption text-text-muted">Loading…</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-center text-caption text-pink-400">
              {error.message}
            </p>
          )}
          {phase === "playing" && partnerStatus === "offline" && (
            <p role="status" className="mt-3 text-center text-caption text-text-secondary">
              {partnerName} left Our Place. You can wait, or end the game.
            </p>
          )}
        </div>

      </div>

      <RejectionToast />
      {phase === "result" && celebration && <Celebration key={session.id} kind={celebration} />}
      {guideOpen && <GameGuide definition={definition} onClose={() => setGuideOpen(false)} />}
      {phase === "playing" && confirmLeave && (
        <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-[var(--border-subtle)] p-3 short:p-2">
          <span className="text-caption text-text-secondary">Leave this game? It won&apos;t count.</span>
          <button type="button" onClick={() => useGameStore.getState().leave()} className="min-h-10 rounded-[var(--radius-md)] bg-black-700 px-3 text-caption text-white-soft">
            Leave
          </button>
          <button type="button" onClick={() => setConfirmLeave(false)} className="min-h-10 px-3 text-caption text-text-secondary">
            Keep playing
          </button>
        </footer>
      )}

    </>
  );
}
