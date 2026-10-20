"use client";

import { useEffect } from "react";
import { AppProviders } from "@/components/app/AppProviders";
import { AppStage } from "@/components/app/AppStage";
import { Lobby } from "@/components/lobby/Lobby";
import { CharacterStudioScreen } from "@/components/studio/CharacterStudioScreen";
import { galleryModelDescriptor } from "@/lib/character/gallery";
import { useChatStore } from "@/store/chatStore";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";
import { useWorldStore } from "@/store/worldStore";

/**
 * DEVELOPMENT ONLY — the real lobby + HUD with stand-in couple data, so layouts
 * can be checked at any screen size without signing in. Network calls fail
 * (no session); that's fine for layout. See app/dev/hud/page.js for options.
 */
const ME = { id: "11111111-1111-4111-8111-111111111111", displayName: "Arnold Preview", avatarUrl: null, avatarThumbnail: null };
const PARTNER = { id: "22222222-2222-4222-8222-222222222222", displayName: "King Preview", avatarUrl: null, avatarThumbnail: null };
const VIEWER = {
  status: "signed_in",
  user: { id: ME.id, email: null },
  couple: { status: "paired", me: ME, partner: PARTNER, couple: { id: "33333333-3333-4333-8333-333333333333", pairedAt: "2026-10-01T00:00:00Z", mySlot: 1 } },
  characters: { mine: null, partner: null },
  characterProviders: { photo: false },
};
const SESSION = { id: "44444444-4444-4444-8444-444444444444", status: "active", createdBy: ME.id, players: [ME.id, PARTNER.id], ready: [ME.id, PARTNER.id], version: 3, result: null, winnerId: null };

const yard = { A1: -1, A2: -1, A3: -1, A4: -1, B1: -1, B2: -1, B3: -1, B4: -1 };
const SAMPLES = {
  ludo: {
    session: { ...SESSION, gameId: "ludo" },
    view: {
      seats: [
        { playerId: ME.id, seat: 0, letter: "A" },
        { playerId: PARTNER.id, seat: 1, letter: "B" },
      ],
      mySeat: 0,
      pieces: { ...yard, A1: 12, A2: 12, A3: 30, B1: 40, B2: 5 },
      current: ME.id,
      phase: "awaiting_move",
      dice: [
        { value: 5, used: false },
        { value: 3, used: false },
      ],
      options: [
        { pieceId: "A3", use: "die0", values: [5], from: 30, to: 35, hops: [], captures: [], enters: false },
        { pieceId: "A3", use: "die1", values: [3], from: 30, to: 33, hops: [], captures: [], enters: false },
        { pieceId: "A3", use: "both", values: [5, 3], from: 30, to: 38, hops: [], captures: [], enters: false },
      ],
      rolls: 4,
      turn: 3,
      doubleSixes: 0,
      bonus: [],
      extraRoll: null,
      lastRoll: { number: 4, by: ME.id, values: [5, 3], doubleSix: false, doubleSixes: 0, outcome: "play" },
      lastMove: null,
      forfeited: [],
      captures: { [ME.id]: 0, [PARTNER.id]: 0 },
      winnerId: null,
    },
  },
  ttt: {
    session: { ...SESSION, gameId: "tic_tac_toe" },
    view: { cells: [ME.id, null, PARTNER.id, null, null, null, null, null, null], marks: { [ME.id]: "X", [PARTNER.id]: "O" }, turn: { order: [ME.id, PARTNER.id], index: 0, number: 3 }, line: null },
  },
  wyr: {
    session: { ...SESSION, gameId: "would_you_rather" },
    view: { round: 3, rounds: 10, phase: "answering", question: { id: "wyr-001", optionA: "Travel the world together for a year", optionB: "Build our dream home together" }, myAnswer: null, partnerAnswered: true, partnerAnswer: null, myNext: false, partnerNext: false, roundsPlayed: 2 },
  },
};

/**
 * Games previewed through their REAL rules: the server's setup runs here with a
 * fixed seed, a few scripted actions are applied by the engine, and the view
 * is what the server would send to ME. `adjust` may tweak the fresh state.
 */
const RULE_SAMPLES = {
  chess: {
    load: () => import("@/games/chess/rules"),
    adjust: (state) => ({ ...state, seats: { w: ME.id, b: PARTNER.id } }),
    script: [
      [ME.id, "move", { from: "e2", to: "e4" }],
      [PARTNER.id, "move", { from: "e7", to: "e5" }],
      [ME.id, "move", { from: "g1", to: "f3" }],
      [PARTNER.id, "move", { from: "d7", to: "d6" }],
      [ME.id, "move", { from: "f1", to: "c4" }],
      [PARTNER.id, "move", { from: "c8", to: "g4" }],
    ],
  },
};

RULE_SAMPLES.whot = {
  gameId: "naija_whot",
  load: () => import("@/games/naija_whot/rules"),
  adjust: (state) => ({ ...state, first: ME.id }),
  script: [[ME.id, "deal", {}]],
};
RULE_SAMPLES.words = {
  gameId: "scrabble",
  load: () => import("@/games/scrabble/rules"),
  adjust: (state) => ({
    ...state,
    current: ME.id,
    board: {
      "7,5": { letter: "H", blank: false, by: PARTNER.id },
      "7,6": { letter: "E", blank: false, by: PARTNER.id },
      "7,7": { letter: "A", blank: false, by: PARTNER.id },
      "7,8": { letter: "R", blank: false, by: PARTNER.id },
      "7,9": { letter: "T", blank: false, by: PARTNER.id },
      "8,7": { letter: "T", blank: false, by: ME.id },
      "9,7": { letter: "E", blank: false, by: ME.id },
    },
    scores: { [ME.id]: 12, [PARTNER.id]: 18 },
  }),
  script: [],
};
RULE_SAMPLES.jigsaw = {
  gameId: "jigsaw_puzzle",
  load: () => import("@/games/jigsaw_puzzle/rules"),
  script: [
    [ME.id, "configure", { difficulty: "medium" }],
    [ME.id, "start", {}],
    [ME.id, "drop", { piece: 0, x: 0, y: 0 }],
    [PARTNER.id, "drop", { piece: 1, x: 1.1, y: 0.1 }],
  ],
};
RULE_SAMPLES.jigsaw_choose = { gameId: "jigsaw_puzzle", load: () => import("@/games/jigsaw_puzzle/rules"), script: [] };
RULE_SAMPLES.whot_settings = { gameId: "naija_whot", load: () => import("@/games/naija_whot/rules"), script: [] };

async function ruleSample(key) {
  const gameId = RULE_SAMPLES[key].gameId ?? key;
  const sample = RULE_SAMPLES[key];
  const [{ default: rules }, { gameRegistry }, engine, { createRandom }] = await Promise.all([sample.load(), import("@/lib/game/catalog"), import("@/lib/game/engine"), import("@/lib/game/random")]);
  const definition = gameRegistry.get(gameId);
  let session = engine.createSession({ id: SESSION.id, definition, rules, coupleId: "preview", playerIds: [ME.id, PARTNER.id], options: definition.sessionDefaults ?? {}, random: createRandom(7), now: Date.now() });
  if (sample.adjust) session = { ...session, state: sample.adjust(session.state) };
  for (const [playerId, type, payload] of sample.script) {
    const outcome = engine.applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(session.version + 11), now: Date.now() });
    if (outcome.ok) session = outcome.session;
    else console.warn("[preview] scripted action refused", type, outcome.error);
  }
  return { session: { ...SESSION, gameId, version: session.version }, view: engine.getPlayerView(session, ME.id, { rules, random: createRandom(1), now: Date.now() }) };
}

function Scenario() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = setTimeout(() => {
      useWorldStore.getState().dispatchPartner({ type: "sync", partnerPresent: true });
      if (RULE_SAMPLES[params.get("game")]) {
        ruleSample(params.get("game")).then((sample) => {
          useGameStore.getState().receive(sample);
          useGameStore.setState({ error: null });
        });
      }
      const sample = SAMPLES[params.get("game")];
      if (sample) {
        const phase = params.get("phase");
        const session =
          phase === "lobby"
            ? { ...sample.session, status: "waiting", ready: [PARTNER.id] }
            : phase === "result"
              ? { ...sample.session, status: "completed", winnerId: ME.id, result: { outcome: "win", winnerId: ME.id, summary: { headline: "Home Sweet Home 🏆", line: "All four pieces made it home.", lines: { winner: "You brought all four pieces home first.", loser: "{winner} brought all four home first." } } } }
              : sample.session;
        useGameStore.getState().receive({ ...sample, session });
        useGameStore.setState({ error: null });
      }
      if (params.get("chat")) useChatStore.getState().setOpen(true);
      if (params.get("panel") || params.get("room")) {
        // Sample room data (the preview has no session to load real data).
        const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
        useRoomStore.setState({
          ready: true,
          streak: { current: 6, best: 9, todayBoth: true },
          partnerSeenAt: ago(42),
          notes: [
            { id: "n1", authorId: PARTNER.id, body: "Good morning sunshine ☀️ Don't forget to eat breakfast!", color: "yellow", createdAt: ago(30), seenAt: null },
            { id: "n2", authorId: ME.id, body: "Movie night on Friday? I'll upload something good 🍿", color: "pink", createdAt: ago(300), seenAt: ago(200) },
            { id: "n3", authorId: PARTNER.id, body: "Miss you already ❤️", color: "blue", createdAt: ago(2000), seenAt: ago(1900) },
          ],
          unseenNotes: 1,
          memories: ["/puzzles/lagos-sunset.svg", "/puzzles/tropical.svg", "/puzzles/night-sky.svg", "/puzzles/hearts.svg"].map((url, i) => ({ id: `m${i}`, uploaderId: i % 2 ? PARTNER.id : ME.id, url, caption: ["Lekki sunset", "The garden party", "Stargazing", "Our place"][i], takenOn: i === 0 ? "2026-08-14" : null, createdAt: ago(i * 900) })),
          videos: [
            { id: "v1", uploaderId: ME.id, kind: "movie", title: "The Wedding Party", sizeBytes: 1.4e9, status: "ready", createdAt: ago(100) },
            { id: "v2", uploaderId: PARTNER.id, kind: "clip", title: "Beach day", sizeBytes: 8.2e7, status: "ready", createdAt: ago(50) },
          ],
          watch: params.get("panel") === "tv-playing" ? { source: { type: "youtube", id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up" }, playing: false, atSeconds: 12, updatedAt: new Date().toISOString(), updatedBy: PARTNER.id, version: 1 } : null,
          trophies: {
            paired_at: ago(60 * 24 * 41),
            together_since: "2026-03-06",
            games_played: 27,
            wins: [
              { game_id: "ludo", user_id: ME.id, wins: 7 },
              { game_id: "ludo", user_id: PARTNER.id, wins: 9 },
              { game_id: "chess", user_id: ME.id, wins: 3 },
              { game_id: "naija_whot", user_id: PARTNER.id, wins: 5 },
            ],
            best_streaks: [{ game_id: "ludo", user_id: PARTNER.id, best: 4 }],
            puzzles_done: 2,
            messages: 812,
            memories: 4,
            notes: 3,
            days_together_here: 31,
          },
          panel: (params.get("panel") ?? "").replace("tv-playing", "tv") || null,
        });
      }
      if (params.get("drawer")) useGameStore.getState().openCategory(params.get("drawer"));
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

const UNPAIRED = { ...VIEWER, couple: { status: "unpaired", me: ME, invite: { code: "K7Q2XW", expiresAt: "2099-01-01T00:00:00Z" } } };

/**
 * ?me=male|female&partner=male|female — those looks instead of the defaults.
 * ?me=file:<name>.glb — a model from assets-src/ (served by /dev/bench/model),
 * animated with the Mixamo clips, e.g. to try an Avaturn export.
 */
function lookCharacter(id, userId) {
  const file = id?.startsWith("file:") ? id.slice(5) : null;
  const model = file ? { key: `dev:${file}`, url: `/dev/bench/model/${encodeURIComponent(file)}`, rig: "mixamo" } : id ? galleryModelDescriptor(id) : null;
  return model ? { userId, provider: "library", version: 1, config: {}, model, updatedAt: null } : null;
}

export function HudPreview() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("panel") || params.get("room")) useRoomStore.setState({ preview: true });
  const screen = params.get("screen");
  const viewer = { ...VIEWER, characters: { mine: lookCharacter(params.get("me"), ME.id), partner: lookCharacter(params.get("partner"), PARTNER.id) } };
  if (screen === "pairing") {
    return (
      <AppProviders viewer={UNPAIRED}>
        <AppStage />
      </AppProviders>
    );
  }
  if (screen === "character") {
    return (
      <AppProviders viewer={VIEWER}>
        <CharacterStudioScreen photoAvailable={false} />
      </AppProviders>
    );
  }
  return (
    <AppProviders viewer={viewer}>
      <Lobby />
      <Scenario />
    </AppProviders>
  );
}
