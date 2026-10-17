"use client";

import { useEffect } from "react";
import { AppProviders } from "@/components/app/AppProviders";
import { AppStage } from "@/components/app/AppStage";
import { Lobby } from "@/components/lobby/Lobby";
import { CharacterStudioScreen } from "@/components/studio/CharacterStudioScreen";
import { useChatStore } from "@/store/chatStore";
import { useGameStore } from "@/store/gameStore";
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

function Scenario() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = setTimeout(() => {
      useWorldStore.getState().dispatchPartner({ type: "sync", partnerPresent: true });
      const sample = SAMPLES[params.get("game")];
      if (sample) {
        useGameStore.getState().receive(sample);
        useGameStore.setState({ error: null });
      }
      if (params.get("chat")) useChatStore.getState().setOpen(true);
      if (params.get("drawer")) useGameStore.getState().openCategory(params.get("drawer"));
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

const UNPAIRED = { ...VIEWER, couple: { status: "unpaired", me: ME, invite: { code: "K7Q2XW", expiresAt: "2099-01-01T00:00:00Z" } } };

export function HudPreview() {
  const screen = new URLSearchParams(window.location.search).get("screen");
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
    <AppProviders viewer={VIEWER}>
      <Lobby />
      <Scenario />
    </AppProviders>
  );
}
