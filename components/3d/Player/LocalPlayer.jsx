import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { standUp } from "@/lib/world/actions";
import { moveWithCollisions } from "@/lib/world/collision";
import { findNearestInteractable } from "@/lib/world/interactions";
import { lerpAngle } from "@/lib/world/interpolation";
import { PLAYER_RADIUS, roomColliders, roomInteractables } from "@/lib/world/rooms/livingRoom";
import { useWorldStore } from "@/store/worldStore";
import { Avatar } from "./Avatar";

const WALK_SPEED = 1.6; // m/s — a relaxed indoor walk, matched to the walk cycle's stride (Character.jsx)
const TURN_SHARPNESS = 12;
const DEAD_ZONE = 0.08;
const INTERACTION_CHECK_S = 0.1; // 10 Hz, not every frame

/**
 * The player you control. Each frame:
 *   input (keys/joystick, camera-relative) → collision → pose → avatar transform
 *   → presence.updatePose (throttled inside) → interaction check (10 Hz)
 * Nothing here causes a React render; the HUD only re-renders when the nearest
 * interactable or the seated state actually changes.
 */
export function LocalPlayer({ runtime, character, reducedMotion }) {
  const group = useRef();
  const motion = useRef({ anim: runtime.localPose.anim, speed: 0 });
  const sinceInteractionCheck = useRef(INTERACTION_CHECK_S);
  const env = useMemo(
    () => ({ radius: PLAYER_RADIUS, bounds: runtime.room.bounds, colliders: roomColliders(runtime.room) }),
    [runtime.room],
  );
  const interactables = useMemo(() => roomInteractables(runtime.room), [runtime.room]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05); // no huge jumps after a tab switch
    const pose = runtime.localPose;
    const move = runtime.input.getMove();
    const magnitude = Math.hypot(move.x, move.y);
    const store = useWorldStore.getState();

    if (magnitude > DEAD_ZONE) {
      if (pose.anim === "sit") {
        standUp(runtime);
        store.setSeated(false);
      }
      const yaw = runtime.camera.yaw;
      // Camera-relative: "forward" is away from the camera.
      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const step = WALK_SPEED * dt;
      const dx = (rightX * move.x + forwardX * move.y) * step;
      const dz = (rightZ * move.x + forwardZ * move.y) * step;
      const next = moveWithCollisions(pose, dx, dz, env);
      pose.x = next.x;
      pose.z = next.z;
      pose.ry = lerpAngle(pose.ry, Math.atan2(dx, dz), 1 - Math.exp(-TURN_SHARPNESS * dt));
      pose.anim = "walk";
    } else if (pose.anim === "walk") {
      pose.anim = "idle";
    }

    motion.current.anim = pose.anim;
    motion.current.speed = magnitude;
    motion.current.emote = runtime.emotes.local; // { name, id } — a new id plays once
    if (group.current) {
      group.current.position.set(pose.x, 0, pose.z);
      group.current.rotation.y = pose.ry;
    }

    runtime.presence?.updatePose(pose, performance.now());

    sinceInteractionCheck.current += dt;
    if (sinceInteractionCheck.current >= INTERACTION_CHECK_S) {
      sinceInteractionCheck.current = 0;
      store.setInteractionTarget(pose.anim === "sit" ? null : findNearestInteractable(pose, interactables));
    }
  });

  return (
    <group ref={group} position={[runtime.localPose.x, 0, runtime.localPose.z]} rotation-y={runtime.localPose.ry}>
      <Avatar character={character} accent="self" motion={motion} reducedMotion={reducedMotion} />
    </group>
  );
}
