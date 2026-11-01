import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Character } from "@/components/character/Character";
import { BED_TOP } from "@/lib/world/rooms/bedroom";
import { palette } from "@/lib/design/tokens";
import { PROFILES } from "@/lib/performance/profiles";
import { usePerformanceStore } from "@/store/performanceStore";
import { getBlobShadowTexture } from "../materials";

/**
 * A player in a 3D space: the person's full-body <Character> plus world-only
 * touches — a soft blob shadow and an identity ring on the floor.
 *
 * `accent`: "self" (army green) or "partner" (soft pink). Identity never relies
 * on colour alone — the partner also carries a name tag (RemotePlayer).
 * `motion` is the owner's per-frame ref: { anim, speed, emote } (see Character).
 *
 * Lying down (anim "lie", the bedroom's bed): the body tips back onto the
 * mattress — feet at the pose's position, head toward −z, face up — and the
 * floor rings hide. The bed's duvet covers the body (BedroomPieces.jsx).
 */
const LIE_LIFT = BED_TOP + 0.05; // the body sinks a little into the mattress
const LIE_SHARPNESS = 8;
const ACCENTS = { self: palette.green500, partner: palette.pink400 };

export function Avatar({ character, accent = "self", motion, opacity = 1, reducedMotion = false, cull = false }) {
  // Quality tier → character quality and real shadows (rare changes; never per frame).
  const tier = usePerformanceStore((state) => state.tier);
  const profile = PROFILES[tier];
  const realShadows = profile.shadows !== "off";
  const materials = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({ color: ACCENTS[accent], transparent: true, opacity: 0.85, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: getBlobShadowTexture(), transparent: true, depthWrite: false }),
    }),
    [accent],
  );
  useEffect(() => {
    materials.ring.opacity = 0.85 * opacity;
    materials.shadow.opacity = opacity;
  }, [materials, opacity]);
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);

  const body = useRef();
  const floor = useRef();
  useFrame((_, delta) => {
    const lying = motion?.current?.anim === "lie";
    if (floor.current) floor.current.visible = !lying;
    if (!body.current) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-LIE_SHARPNESS * Math.min(delta, 0.05));
    body.current.rotation.x += ((lying ? -Math.PI / 2 : 0) - body.current.rotation.x) * k;
    body.current.position.y += ((lying ? LIE_LIFT : 0) - body.current.position.y) * k;
  });

  return (
    <group>
      <group ref={floor}>
        {!realShadows && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.005} material={materials.shadow}>
            <planeGeometry args={[0.9, 0.9]} />
          </mesh>
        )}
        <mesh rotation-x={-Math.PI / 2} position-y={0.012} material={materials.ring}>
          <ringGeometry args={[0.36, 0.41, 40]} />
        </mesh>
      </group>
      <group ref={body}>
      <Character
        character={character}
        motion={motion}
        opacity={opacity}
        reducedMotion={reducedMotion}
        quality={profile.characterQuality}
        textureMax={profile.textureMax}
        castShadow={realShadows}
        cull={cull}
      />
      </group>
    </group>
  );
}
