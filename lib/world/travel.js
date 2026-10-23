import { useRangeStore } from "@/store/rangeStore";
import { useWorldStore } from "@/store/worldStore";
import { arrivalIn, roomById } from "./rooms";

/**
 * Going to another room: a short fade, then you're standing just inside the
 * door you came through, facing in, with the camera behind you. The world
 * runtime's room changes (collisions, interactables, camera bounds all read
 * it) and the world store tells React to draw the new room. Presence carries
 * the new room to your partner with your next pose.
 */
const FADE_MS = 260;

export function travel(runtime, roomId, doorId) {
  const store = useWorldStore.getState();
  if (store.fading) return;
  store.setFading(true);
  useRangeStore.getState().leave(); // stepping away from a lane, if you were at one
  setTimeout(() => {
    const room = roomById(roomId);
    const at = arrivalIn(room.id, doorId);
    runtime.room = room;
    Object.assign(runtime.localPose, { x: at.x, z: at.z, ry: at.ry, anim: "idle", room: room.id });
    runtime.camera.yaw = at.ry + Math.PI; // behind you
    useWorldStore.getState().setRoom(room.id);
    setTimeout(() => useWorldStore.getState().setFading(false), 60);
  }, FADE_MS);
}

// Development only: go anywhere from devtools — __ourPlaceTravel(__ourPlaceControls, "range_room").
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") window.__ourPlaceTravel = travel;
