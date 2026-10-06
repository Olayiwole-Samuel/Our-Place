"use client";

import { useEffect, useState } from "react";
import { WorldStage } from "@/components/3d/World/WorldStage";
import { Wordmark } from "@/components/brand/Wordmark";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useCoarsePointer } from "@/hooks/useMediaQuery";
import { livingRoom } from "@/lib/world/rooms/livingRoom";
import { createWorldRuntime } from "@/lib/world/runtime";
import { useCharacterStore } from "@/store/characterStore";
import { useCoupleStore } from "@/store/coupleStore";
import { useVoiceStore } from "@/store/voiceStore";
import { useWorldStore } from "@/store/worldStore";
import { AccountMenu } from "./AccountMenu";
import { InteractPrompt, ObjectCard, SeatedHint } from "./InteractionUI";
import { Joystick } from "./Joystick";
import { OfflineBanner } from "./OfflineBanner";
import { OnboardingHint } from "./OnboardingHint";
import { ConnectionStatus, PartnerStatus } from "./PresenceStatus";
import { CommsDock } from "./comms/CommsDock";
import { GameMenu } from "./games/GameMenu";
import { GameStage } from "./games/GameStage";
import { useCoupleGames } from "./games/useCoupleGames";
import { useCoupleComms, usePresenceNotices } from "./useCoupleComms";
import { useCouplePresence, usePartnerPresenceEffects } from "./useCouplePresence";
import { useWorldControls } from "./useWorldControls";

const PRESENCE_WAIT_MS = 5000;

/**
 * Our Place: the couple's living room. The world fills the screen; the HUD
 * sits at the edges inside the safe area and never covers the middle:
 *
 *   top-left      partner + presence          top-right   connection, account
 *   right         the floating game menu (ten categories → drawer → game)
 *   bottom-left   joystick (touch)            bottom-right interact; emotes · chat · mic
 *   bottom-centre contextual cards (object info, first-visit hint, seated hint)
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
  // Saved characters (server-confirmed). The partner may not have created theirs
  // yet — they then appear as the default built-in character.
  const myCharacter = useCharacterStore((state) => state.mine);
  const partnerCharacter = useCharacterStore((state) => state.partner);

  useEffect(() => {
    useWorldStore.getState().reset();
    return () => useWorldStore.getState().reset();
  }, []);

  useCouplePresence({ runtime, coupleId: couple.id, userId: me.id, partnerId: partner.id });
  usePartnerPresenceEffects({ runtime, partnerName });
  // Chat, voice and emotes. Kept out of the 3D tree: messages and voice state
  // re-render only the HUD, never the scene.
  const { triggerEmote } = useCoupleComms({ runtime, coupleId: couple.id, userId: me.id, partnerId: partner.id });
  usePresenceNotices(partnerName);
  // Games: the couple's sessions + live events (one subscription for the room's lifetime).
  useCoupleGames({ coupleId: couple.id, userId: me.id });
  const inGame = useWorldStore((state) => state.inGame);
  const { interact, lookHandlers } = useWorldControls(runtime);

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
      <div className="absolute inset-0" {...lookHandlers}>
        <WorldStage runtime={runtime} partner={partner} myCharacter={myCharacter} partnerCharacter={partnerCharacter} />
      </div>

      {ready && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between safe-inset">
          <header className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <PartnerStatus />
            </div>
            <OfflineBanner />
            <div className="pointer-events-auto flex items-center gap-2">
              <ConnectionStatus />
              <AccountMenu
                beforeSignOut={async () => {
                  await Promise.allSettled([runtime.presence?.leave(), useVoiceStore.getState().shutdown()]);
                }}
              />
            </div>
          </header>

          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col items-start gap-2">
              {touch ? !inGame && <Joystick input={runtime.input} /> : <Wordmark size="sm" className="opacity-80" />}
            </div>

            <div className="flex flex-1 flex-col items-center gap-2 self-end">
              <ObjectCard />
              <SeatedHint touch={touch} />
              <OnboardingHint touch={touch} partnerName={partnerName} ready={ready} />
            </div>

            <div className="hud-actions flex flex-col items-end gap-3">
              {!inGame && <InteractPrompt onInteract={interact} touch={touch} />}
              <CommsDock meId={me.id} partnerName={partnerName} runtime={runtime} onEmote={triggerEmote} />
            </div>
          </div>

          {/* Right edge: the floating game menu (reserved for it since Phase 3). */}
          <GameMenu disabled={inGame} />
          <GameStage me={me} partner={partner} onEmote={triggerEmote} />
        </div>
      )}
    </main>
  );
}
