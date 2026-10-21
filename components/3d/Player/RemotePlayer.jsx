import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { palette } from "@/lib/design/tokens";
import { useVoiceStore } from "@/store/voiceStore";
import { shortName } from "@/lib/couple/names";
import { useWorldStore } from "@/store/worldStore";
import { createTextTexture } from "../materials";
import { Avatar } from "./Avatar";

const ARRIVAL_S = 0.9;
const SPEAKING_FADE = 10;

/** Name above the partner's head — identity that doesn't rely on colour alone. */
function NameTag({ name }) {
  const texture = useMemo(
    () =>
      createTextTexture([{ text: name, size: 44, weight: 600, color: palette.white }], {
        width: 320,
        height: 80,
        background: "rgba(8,10,9,0.72)",
      }),
    [name],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, 2.08, 0]} scale={[0.6, 0.15, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

/**
 * Your partner, rendered only while Realtime presence says they're here
 * ("online"), or dimmed for a short grace period if their connection dropped
 * ("away"). Position comes from the interpolation buffer sampled every frame —
 * never straight from the network — so movement is smooth, not teleporting.
 */
export function RemotePlayer({ runtime, profile, character, reducedMotion }) {
  const status = useWorldStore((state) => state.partner.status);
  const visible = status === "online" || status === "away";
  if (!visible) return null;
  return <PresentPartner runtime={runtime} profile={profile} character={character} away={status === "away"} reducedMotion={reducedMotion} />;
}

function PresentPartner({ runtime, profile, character, away, reducedMotion }) {
  const group = useRef();
  const pulse = useRef();
  const motion = useRef({ anim: "idle", speed: 0 });
  const age = useRef(0);
  const [arriving, setArriving] = useState(!reducedMotion);
  const voiceRing = useRef();
  const voiceLevel = useRef(0);
  const pulseMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: palette.pink400, transparent: true, depthWrite: false }), []);
  const voiceMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: palette.blue400, transparent: true, opacity: 0, depthWrite: false }), []);
  useEffect(
    () => () => {
      pulseMaterial.dispose();
      voiceMaterial.dispose();
    },
    [pulseMaterial, voiceMaterial],
  );

  useFrame((_, delta) => {
    const pose = runtime.partnerBuffer.sample(performance.now());
    if (!pose || !group.current) return;
    group.current.position.set(pose.x, 0, pose.z);
    group.current.rotation.y = pose.ry;
    motion.current.anim = pose.anim;
    motion.current.speed = pose.anim === "walk" ? 1 : 0;
    motion.current.emote = runtime.emotes.partner;

    // Speaking (real Daily audio level): a quiet sky-blue ring at their feet.
    // Read without subscribing, so voice updates never re-render the scene.
    const speaking = useVoiceStore.getState().partner.speaking;
    voiceLevel.current += ((speaking ? 1 : 0) - voiceLevel.current) * (1 - Math.exp(-SPEAKING_FADE * delta));
    voiceMaterial.opacity = 0.75 * voiceLevel.current;
    if (voiceRing.current) {
      voiceRing.current.visible = voiceLevel.current > 0.01;
      voiceRing.current.scale.setScalar(1 + voiceLevel.current * 0.08 * (reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(performance.now() / 160)));
    }

    // Arrival: a soft rise and a pink ring that opens and fades.
    if (arriving) {
      age.current += delta;
      const t = Math.min(1, age.current / ARRIVAL_S);
      const eased = 1 - Math.pow(1 - t, 3);
      group.current.scale.setScalar(0.85 + 0.15 * eased);
      if (pulse.current) {
        pulse.current.scale.setScalar(0.6 + eased * 1.4);
        pulseMaterial.opacity = 0.7 * (1 - t);
      }
      if (t >= 1) setArriving(false);
    }
  });

  const name = shortName(profile);

  return (
    <group ref={group}>
      <Avatar character={character} accent="partner" motion={motion} opacity={away ? 0.4 : 1} reducedMotion={reducedMotion} cull />
      <NameTag name={away ? `${name} · reconnecting` : name} />
      <mesh ref={voiceRing} rotation-x={-Math.PI / 2} position-y={0.016} material={voiceMaterial} visible={false}>
        <ringGeometry args={[0.47, 0.5, 48]} />
      </mesh>
      {arriving && (
        <mesh ref={pulse} rotation-x={-Math.PI / 2} position-y={0.02} material={pulseMaterial}>
          <ringGeometry args={[0.4, 0.46, 48]} />
        </mesh>
      )}
    </group>
  );
}
