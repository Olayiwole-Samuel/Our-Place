"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * What the dog is eating (state.food from lib/pet/behaviour.js): kibble poured
 * into its bowl — a little mound that empties piece by piece — or a biscuit
 * bone you put down, which gets smaller bite by bite.
 */
const KIBBLE = 22;
const kibbleMaterial = new THREE.MeshStandardMaterial({ color: "#9a5f2e", roughness: 0.9 });
const biscuitMaterial = new THREE.MeshStandardMaterial({ color: "#d9a466", roughness: 0.85 });
const kibbleGeometry = new THREE.SphereGeometry(0.0065, 6, 4);

export function Food({ stateRef }) {
  const kibble = useRef();
  const treat = useRef();
  // A mound: a few rings of pieces, highest in the middle (eaten from the top).
  const spots = useMemo(() => {
    const list = [];
    for (let i = 0; i < KIBBLE; i++) {
      const ring = i < 8 ? 0.032 : i < 16 ? 0.019 : 0.007;
      const angle = i * 2.399;
      list.push(new THREE.Vector3(Math.cos(angle) * ring, (i < 8 ? 0 : i < 16 ? 0.007 : 0.013) + (i % 3) * 0.0015, Math.sin(angle) * ring));
    }
    return list;
  }, []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame(() => {
    const food = stateRef.current?.food;
    const k = kibble.current;
    const t = treat.current;
    if (!k || !t) return;
    k.visible = food?.kind === "kibble" && food.amount > 0.01;
    t.visible = food?.kind === "treat" && food.amount > 0.01;
    if (k.visible) {
      k.position.set(food.x, food.inBowl ? 0.045 : 0.006, food.z);
      k.count = Math.max(1, Math.ceil(food.amount * KIBBLE));
      for (let i = 0; i < KIBBLE; i++) k.setMatrixAt(i, matrix.makeTranslation(spots[i].x, spots[i].y, spots[i].z));
      k.instanceMatrix.needsUpdate = true;
    }
    if (t.visible) {
      t.position.set(food.x, 0.012, food.z);
      // Bitten from one end: shorter, a little narrower.
      t.scale.set(0.4 + 0.6 * food.amount, 1, 0.7 + 0.3 * food.amount);
    }
  });

  return (
    <>
      <instancedMesh ref={kibble} args={[kibbleGeometry, kibbleMaterial, KIBBLE]} visible={false} castShadow />
      <group ref={treat} visible={false}>
        <mesh material={biscuitMaterial} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.008, 0.05, 4, 8]} />
        </mesh>
        {[-0.034, 0.034].flatMap((x) =>
          [-0.009, 0.009].map((z) => (
            <mesh key={`${x}${z}`} material={biscuitMaterial} position={[x, 0, z]} castShadow>
              <sphereGeometry args={[0.012, 8, 6]} />
            </mesh>
          )),
        )}
      </group>
    </>
  );
}
