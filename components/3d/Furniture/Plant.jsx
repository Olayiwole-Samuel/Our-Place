import { useMemo } from "react";
import { BlobShadow } from "./Furniture";
import { getMaterials } from "../materials";

/**
 * The couple's plant. Its look is a pure function of `stage`, which the room
 * config supplies — room evolution (later phase) only has to raise the stage.
 *   0 small → 1 growing → 2 mature → 3 milestone (a small pink bloom)
 */
const STAGES = [
  { height: 0.55, leaves: 7, spread: 0.22 },
  { height: 0.85, leaves: 10, spread: 0.3 },
  { height: 1.15, leaves: 14, spread: 0.38 },
  { height: 1.3, leaves: 16, spread: 0.42, bloom: true },
];

export function Plant({ stage = 0 }) {
  const m = getMaterials();
  const config = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))];

  const leaves = useMemo(
    () =>
      Array.from({ length: config.leaves }, (_, i) => {
        const angle = i * 2.39996; // golden angle: natural, non-repeating spread
        const t = (i + 1) / config.leaves;
        return {
          position: [Math.cos(angle) * config.spread * t, 0.45 + config.height * (0.35 + 0.65 * t), Math.sin(angle) * config.spread * t],
          rotation: [Math.sin(angle) * 0.9, -angle, Math.cos(angle) * 0.9],
          scale: [0.09, 0.32 + 0.12 * (1 - t), 0.02],
          deep: i % 3 === 0,
        };
      }),
    [config],
  );

  return (
    <group>
      <BlobShadow width={0.9} depth={0.9} opacity={0.7} />
      <mesh position={[0, 0.2, 0]} material={m.ceramic}>
        <cylinderGeometry args={[0.24, 0.19, 0.4, 20]} />
      </mesh>
      <mesh position={[0, 0.395, 0]} rotation-x={-Math.PI / 2} material={m.soil}>
        <circleGeometry args={[0.22, 20]} />
      </mesh>
      {leaves.map((leaf, i) => (
        <mesh key={i} position={leaf.position} rotation={leaf.rotation} scale={leaf.scale} material={leaf.deep ? m.leafDeep : m.leaf}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
      {config.bloom && (
        <mesh position={[0.05, 0.5 + config.height, 0]} material={m.cushionPink}>
          <sphereGeometry args={[0.05, 12, 8]} />
        </mesh>
      )}
    </group>
  );
}
