"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { DECOR, footprint } from "@/lib/room/decor";
import { useDecorStore } from "@/store/decorStore";
import { useRoomStore } from "@/store/roomStore";
import { DecorItem } from "./DecorItem";

/**
 * Everything you placed (couple_decor), plus — in Decorate — the thing being
 * placed or moved as a see-through preview (green: fine here, pink: not here)
 * with its footprint on the floor.
 */
const outlineOk = new THREE.MeshBasicMaterial({ color: "#8fdc7a", transparent: true, opacity: 0.35, depthWrite: false });
const outlineBad = new THREE.MeshBasicMaterial({ color: "#f3a6b9", transparent: true, opacity: 0.35, depthWrite: false });

export function DecorLayer() {
  const decor = useRoomStore((state) => state.decor);
  const active = useDecorStore((state) => state.active);
  const placing = useDecorStore((state) => state.placing);
  const problem = useDecorStore((state) => state.problem);
  const size = useMemo(() => (placing ? footprint(DECOR[placing.item], placing.rotation) : null), [placing]);

  return (
    <group name="decor">
      {decor.map((thing) =>
        placing?.id === thing.id ? null : (
          <group key={thing.id} position={[thing.x, 0, thing.z]} rotation-y={thing.rotation}>
            <DecorItem item={thing.item} />
          </group>
        ),
      )}
      {active && placing && (
        <>
          <group position={[placing.x, 0, placing.z]} rotation-y={placing.rotation}>
            <DecorItem key={`${placing.item}-${problem ? "bad" : "ok"}`} item={placing.item} ghost={problem ? "bad" : "ok"} />
          </group>
          <mesh position={[placing.x, 0.02, placing.z]} rotation-x={-Math.PI / 2} material={problem ? outlineBad : outlineOk}>
            <planeGeometry args={[size.halfWidth * 2 + 0.08, size.halfDepth * 2 + 0.08]} />
          </mesh>
        </>
      )}
    </group>
  );
}
