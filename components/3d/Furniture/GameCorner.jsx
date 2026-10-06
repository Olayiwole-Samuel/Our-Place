import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { GAME_CATEGORIES } from "@/lib/game/categories";
import { BlobShadow } from "./Furniture";
import { getMaterials } from "../materials";

/**
 * The game corner on the right side of the room: the in-world home of the game
 * menu. Ten small sky-blue tiles orbit above a low console — one per game
 * category, read from the category registry (not hard-coded) — so the corner
 * already reflects the locked ten-category menu that opens here later.
 */
export function GameCorner({ reducedMotion = false }) {
  const m = getMaterials();
  const orbit = useRef();

  useFrame((_, delta) => {
    if (!reducedMotion && orbit.current) orbit.current.rotation.y += delta * 0.25;
  });

  const count = GAME_CATEGORIES.length;

  return (
    <group>
      <BlobShadow width={0.9} depth={1.6} opacity={0.7} />
      <mesh position={[0, 0.36, 0]} material={m.blackMetal}>
        <boxGeometry args={[1.2, 0.72, 0.5]} />
      </mesh>
      <mesh position={[0, 0.73, 0.251]} material={m.liveGlow}>
        <boxGeometry args={[1.1, 0.012, 0.004]} />
      </mesh>
      <group ref={orbit} position={[0, 1.35, 0]}>
        <mesh rotation-x={Math.PI / 2} material={m.liveGlow}>
          <torusGeometry args={[0.36, 0.006, 6, 48]} />
        </mesh>
        {GAME_CATEGORIES.map((category, i) => {
          const angle = (i / count) * Math.PI * 2;
          return (
            <mesh key={category.id} position={[Math.cos(angle) * 0.36, 0, Math.sin(angle) * 0.36]} rotation-y={-angle} material={m.liveGlow}>
              <boxGeometry args={[0.07, 0.07, 0.012]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
