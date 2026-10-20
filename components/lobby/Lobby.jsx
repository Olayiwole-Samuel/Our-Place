"use client";

import { useEffect, useMemo, useState } from "react";
import { WorldStage } from "@/components/3d/World/WorldStage";
import { Wordmark } from "@/components/brand/Wordmark";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useCoarsePointer } from "@/hooks/useMediaQuery";
import { isSupabaseConfigured } from "@/lib/config/env";
import { livingRoom } from "@/lib/world/rooms/livingRoom";
import { createWorldRuntime } from "@/lib/world/runtime";
import { displayedCharacter } from "@/lib/character/looks";
import { useCharacterStore, useCharacterStoreApi } from "@/store/characterStore";
import { useChatStore } from "@/store/chatStore";
import { useCoupleStore } from "@/store/coupleStore";
import { useVoiceStore } from "@/store/voiceStore";
import { useRoomStore } from "@/store/roomStore";
import { useWorldStore } from "@/store/worldStore";
import { AccountMenu } from "./AccountMenu";
import { ChooseCharacterCard } from "./CharacterSwitch";
import { FullscreenButton, RotateGate } from "./RotateGate";
import { PushPrompt } from "./PushControls";
import { InteractPrompt, ObjectCard, SeatedHint } from "./InteractionUI";
import { Joystick } from "./Joystick";
import { OfflineBanner } from "./OfflineBanner";
import { OnboardingHint } from "./OnboardingHint";
import { ConnectionStatus, PartnerStatus } from "./PresenceStatus";
import { CommsDock } from "./comms/CommsDock";
import { GameMenu } from "./games/GameMenu";
import { GameStage } from "./games/GameStage";
import { useCoupleGames } from "./games/useCoupleGames";
import { NowPlayingChip, RoomMenu, RoomPanels, StreakBadge } from "./room/RoomPanels";
import { useCoupleComms, usePresenceNotices } from "./useCoupleComms";
import { useCouplePresence, usePartnerPresenceEffects } from "./useCouplePresence";
import { useWorldControls } from "./useWorldControls";

const PRESENCE_WAIT_MS = 5000;

/**
 * Our Place: the couple's living room. The world fills the screen; the HUD
 * sits at the edges inside the safe area and never covers the middle:
 *
 *   top-left      partner + presence          top-right   connection, account
 *   right         the Games button (categories → games → launch)
 *   bottom-left   joystick (touch)            bottom-right interact; emotes · chat · mic
 *   bottom-centre contextual cards (object info, first-visit hint, seated hint)
 *
 * Corners are pinned (absolutely positioned), so nothing in the middle can push
 * a control off a narrow screen. Cards sit between the corners when there is
 * room, otherwise above them (see `.hud-center` in globals.css).
 */
export function Lobby() {
  const me = useCoupleStore((state) => state.me);
  const partner = useCoupleStore((state) => state.partner);
  const couple = useCoupleStore((state) => state.couple);
  if (!me || !partner || !couple) return <LoadingScreen label="Preparing your space" />;
  return <LivingRoom me={me} partner={partner} couple={couple} />;
}

function LivingRoom({ me, partner, couple }) {
  const [runtime] = useState(() => createWorldRuntime(livingRoom, couple.mySlot));
  const touch = useCoarsePointer();
  const loadStage = useWorldStore((state) => state.loadStage);
  const connection = useWorldStore((state) => state.connection);
  const partnerStatus = useWorldStore((state) => state.partner.status);
  const partnerName = partner.displayName?.split(" ")[0] || "Your person";
  // Saved characters (server-confirmed), shown as the chosen male/female look —
  // or the default look until someone picks one (lib/character/looks.js).
  const savedMine = useCharacterStore((state) => state.mine);
  const savedPartner = useCharacterStore((state) => state.partner);
  const myCharacter = useMemo(() => displayedCharacter(savedMine), [savedMine]);
  const partnerCharacter = useMemo(() => displayedCharacter(savedPartner), [savedPartner]);
  const characterStore = useCharacterStoreApi();

  useEffect(() => {
    useWorldStore.getState().reset();
    return () => useWorldStore.getState().reset();
  }, []);

  useCouplePresence({ runtime, coupleId: couple.id, userId: me.id, partnerId: partner.id, onPartnerCharacter: () => characterStore.getState().refresh() });
  usePartnerPresenceEffects({ runtime, partnerName });
  // Chat, voice and emotes. Kept out of the 3D tree: messages and voice state
  // re-render only the HUD, never the scene.
  const { triggerEmote } = useCoupleComms({ runtime, coupleId: couple.id, userId: me.id, partnerId: partner.id });
  usePresenceNotices(partnerName);
  // Games: the couple's sessions + live events (one subscription for the room's lifetime).
  useCoupleGames({ coupleId: couple.id, userId: me.id });
  // The room's shared things: notes, memories, TV, trophies, streak, last seen.
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    let close = null;
    let cancelled = false;
    import("@/lib/supabase/client").then(({ getSupabaseBrowserClient }) => {
      if (!cancelled) close = useRoomStore.getState().open({ supabase: getSupabaseBrowserClient(), coupleId: couple.id, userId: me.id, partnerId: partner.id });
    });
    return () => {
      cancelled = true;
      close?.();
    };
  }, [couple.id, me.id, partner.id]);
  const roomPanel = useRoomStore((state) => state.panel);
  const inGame = useWorldStore((state) => state.inGame);
  const chatOpen = useChatStore((state) => state.open);
  const lookLocked = useWorldStore((state) => state.lookLocked);
  const { interact, lookHandlers } = useWorldControls(runtime);
  // Live, cosmetic hints between the two game clients (e.g. a dragged jigsaw piece).
  const hints = useMemo(
    () => ({
      send: (hint) => runtime.presence?.sendHint?.(hint),
      subscribe: (listener) => {
        (runtime.hintListeners ??= new Set()).add(listener);
        return () => runtime.hintListeners.delete(listener);
      },
    }),
    [runtime],
  );

  // "Finding your person" ends when presence answers — or after a short wait, so
  // a slow or failed connection never traps anyone on the loading screen.
  useEffect(() => {
    if (loadStage !== "presence") return undefined;
    const settled = partnerStatus !== "unknown" || connection === "unavailable" || connection === "closed";
    if (settled) {
      useWorldStore.getState().setLoadStage("ready");
      return undefined;
    }
    const timer = setTimeout(() => useWorldStore.getState().setLoadStage("ready"), PRESENCE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [loadStage, partnerStatus, connection]);

  const ready = loadStage === "ready";

  return (
    <main className="app-viewport bg-black-950">
      <RotateGate />
      <div className="absolute inset-0" {...lookHandlers}>
        <WorldStage runtime={runtime} partner={partner} myCharacter={myCharacter} partnerCharacter={partnerCharacter} />
      </div>

      {ready && (
        <div className="hud pointer-events-none absolute inset-0 z-20 safe-inset" data-touch={touch ? "true" : "false"} data-ingame={inGame ? "true" : "false"}>
          <header className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <PartnerStatus />
              <StreakBadge />
            </div>
            <OfflineBanner />
            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
              <ConnectionStatus />
              <FullscreenButton />
              <AccountMenu
                runtime={runtime}
                partnerName={partnerName}
                beforeSignOut={async () => {
                  await Promise.allSettled([runtime.presence?.leave(), useVoiceStore.getState().shutdown()]);
                }}
              />
            </div>
          </header>

          <div className="hud-corner-left flex flex-col items-start gap-2">
            {touch ? !inGame && <Joystick input={runtime.input} /> : <Wordmark size="sm" className="opacity-80" />}
          </div>

          {/* Hidden while chatting: the chat panel covers the middle on most screens. */}
          {!inGame && !chatOpen && !roomPanel && (
            <div className="hud-center flex flex-col items-center gap-2">
              <NowPlayingChip me={me.id} partnerName={partnerName} />
              <PushPrompt partnerName={partnerName} />
              <ChooseCharacterCard runtime={runtime} />
              <ObjectCard />
              <SeatedHint touch={touch} />
              <OnboardingHint touch={touch} partnerName={partnerName} ready={ready} />
            </div>
          )}

          {lookLocked && (
            <p role="status" className="look-lock-hint panel pointer-events-none rounded-full px-3 py-1.5 text-micro tracking-normal text-text-secondary">
              Cursor locked · move the mouse to look · <span className="font-semibold text-white-soft">Ctrl</span> to release
            </p>
          )}

          <div className="hud-actions flex flex-col items-end gap-3">
            {!inGame && <InteractPrompt onInteract={interact} touch={touch} />}
            <CommsDock meId={me.id} partnerName={partnerName} runtime={runtime} onEmote={triggerEmote} />
          </div>

          {/* Right edge: the floating game menu (reserved for it since Phase 3). */}
          <GameMenu disabled={inGame} />
          <RoomMenu disabled={inGame} />
          <RoomPanels me={me} partner={partner} partnerName={partnerName} />
          <GameStage me={me} partner={partner} onEmote={triggerEmote} hints={hints} />
        </div>
      )}
    </main>
  );
}
