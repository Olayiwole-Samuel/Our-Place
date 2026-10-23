import { createInputState } from "./input";
import { createPoseBuffer } from "./interpolation";

/**
 * Per-session, non-reactive world data shared by the render loop, input and the
 * network layer. Plain mutable objects: read and written every frame without
 * involving React.
 *
 *   localPose        { x, z, ry, anim } — the local player, authoritative for presence
 *   partnerBuffer    snapshot buffer the partner avatar samples from
 *   input            keyboard + joystick
 *   camera.yaw       orbit angle around the player (drag to look)
 *   presence         the open presence connection, once joined (updatePose/leave)
 *   emotes           { local, partner }: the latest emote for each character as
 *                    { name, id } — players hand it to <Character> via their motion ref
 */
export function createWorldRuntime(room, slot) {
  const spawn = room.spawnPoints[slot] ?? room.spawnPoints[1];
  return {
    room,
    slot,
    localPose: { x: spawn.x, z: spawn.z, ry: spawn.ry, anim: "idle", room: room.id },
    partnerRoom: null, // the room your partner is in (from presence)
    partnerBuffer: createPoseBuffer(),
    input: createInputState(),
    camera: { yaw: 0 },
    presence: null,
    emotes: { local: null, partner: null },
  };
}
