"use client";

import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/config/env";
import { reportError } from "@/lib/errors";
import { joinCouplePresence } from "@/lib/realtime/couplePresence";
import { PARTNER_AWAY_GRACE_MS } from "@/lib/world/partnerPresence";
import { toast } from "@/store/toastStore";
import { useWorldStore } from "@/store/worldStore";

/**
 * Connects the world to the couple's private presence channel for as long as the
 * lobby is open, and turns presence into calm, honest UI:
 *
 * - partner pose snapshots → runtime.partnerBuffer (interpolated by RemotePlayer)
 * - presence sync / deliberate leave → partner status machine (worldStore)
 * - a dropped partner connection → "away" for a grace period, then offline
 * - arrival → "❤️ <name>'s here." toast (departure is shown calmly in the status, no toast)
 * - closing the tab / signing out → deliberate leave (instant for the partner)
 *
 * Identity used here (couple id, own id, partner id) comes from the
 * server-verified couple state; the channel itself is authorized by RLS.
 */
export function useCouplePresence({ runtime, coupleId, userId, partnerId }) {
  useEffect(() => {
    const world = useWorldStore.getState();
    if (!isSupabaseConfigured()) {
      world.setConnection("unavailable");
      return undefined;
    }

    let presence = null;
    let cancelled = false;
    const dispatch = (event) => useWorldStore.getState().dispatchPartner(event);

    import("@/lib/supabase/client")
      .then(({ getSupabaseBrowserClient }) => {
        if (cancelled) return;
        presence = joinCouplePresence({
          supabase: getSupabaseBrowserClient(),
          coupleId,
          userId,
          partnerId,
          bounds: runtime.room.bounds,
          initialPose: runtime.localPose,
          handlers: {
            onConnection: (status) => useWorldStore.getState().setConnection(status),
            onPartnerSync: ({ present, pose }) => {
              // The tracked pose is only the partner's resting pose: use it to place
              // them on arrival, never to override live movement already streaming in.
              if (present && pose && runtime.partnerBuffer.size === 0) runtime.partnerBuffer.push(pose, performance.now());
              dispatch({ type: "sync", partnerPresent: present });
            },
            onPartnerPose: (pose) => runtime.partnerBuffer.push(pose, performance.now()),
            onPartnerLeft: () => dispatch({ type: "partner_left" }),
          },
        });
        runtime.presence = presence;
      })
      .catch((error) => {
        reportError(error, { feature: "presence" });
        useWorldStore.getState().setConnection("closed");
      });

    const onPageHide = () => presence?.leave();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      presence?.leave();
      runtime.presence = null;
    };
  }, [runtime, coupleId, userId, partnerId]);
}

/** Side effects of partner status changes: grace timer, arrival/departure notices. */
export function usePartnerPresenceEffects({ runtime, partnerName }) {
  const partner = useWorldStore((state) => state.partner);

  useEffect(() => {
    if (partner.announce) toast(`❤️ ${partnerName}'s here.`, "relationship");
  }, [partner, partnerName]);

  useEffect(() => {
    if (partner.status === "offline") runtime.partnerBuffer.clear();
    if (partner.status !== "away") return undefined;
    const timer = setTimeout(() => useWorldStore.getState().dispatchPartner({ type: "grace_expired" }), PARTNER_AWAY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [partner.status, runtime]);
}
