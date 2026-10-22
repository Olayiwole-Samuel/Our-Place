"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { dogAt, growthOf } from "@/lib/pet/behaviour";
import { decorColliders } from "@/lib/room/decor";
import { roomColliders } from "@/lib/world/rooms/livingRoom";
import { useRoomStore } from "@/store/roomStore";
import { Dog } from "./Dog";
import { Food } from "./Food";

/**
 * Your dog in the room: each frame, where it is and what it's doing comes from
 * lib/pet/behaviour.js on the server's clock (so both screens agree), given the
 * furniture it walks around and the latest thing either of you asked it.
 * Shares its position with the world (`runtime.pet`) for "walk up and play".
 */
export function PetLayer({ runtime, reducedMotion }) {
  const pet = useRoomStore((state) => state.pet);
  const decor = useRoomStore((state) => state.decor);
  const coupleId = useRoomStore((state) => state.coupleId);
  const stateRef = useRef(null);
  const world = useMemo(
    () => ({
      key: decor.map((d) => `${d.item}@${d.x.toFixed(2)},${d.z.toFixed(2)},${d.rotation.toFixed(2)}`).join("|") || "empty",
      seed: coupleId ?? "our-place",
      bounds: runtime.room.bounds,
      colliders: [...roomColliders(runtime.room), ...decorColliders(decor)],
      placed: decor,
      dogSize: growthOf(pet?.createdAt ?? null, Date.now()).size,
    }),
    [decor, coupleId, runtime.room, pet?.createdAt],
  );

  useFrame(() => {
    const skew = useRoomStore.getState().skewMs ?? 0;
    const state = dogAt(pet, world, Date.now() + skew);
    stateRef.current = state;
    runtime.pet = { x: state.x, z: state.z, name: pet?.name ?? null };
  });

  // Before the dog's row exists (or the migration), it still lives here, unnamed.
  if (stateRef.current === null) stateRef.current = dogAt(pet, world, Date.now());
  // Grows from a puppy over its first two months with you (re-read each minute is plenty).
  const growth = growthOf(pet?.createdAt ?? null, Date.now());
  return (
    <>
      <Dog stateRef={stateRef} name={pet?.name ?? null} growth={growth} reducedMotion={reducedMotion} />
      <Food stateRef={stateRef} />
    </>
  );
}
