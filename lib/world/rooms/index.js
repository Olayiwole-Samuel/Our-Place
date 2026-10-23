import { gameRoom } from "./gameRoom";
import { hallway } from "./hallway";
import { livingRoom } from "./livingRoom";
import { rangeRoom } from "./rangeRoom";

/**
 * Every room in the house. You start in the living room; its door leads to
 * the hallway, which leads everywhere else (lib/world/travel.js). Each of you
 * can be in a different room — presence says which (lib/realtime/couplePresence.js).
 */
export const ROOMS = Object.freeze({
  [livingRoom.id]: livingRoom,
  [hallway.id]: hallway,
  [gameRoom.id]: gameRoom,
  [rangeRoom.id]: rangeRoom,
});

export const HOME_ROOM = livingRoom.id;

/** The room with this id, or the living room for anything unknown. */
export const roomById = (id) => ROOMS[id] ?? livingRoom;

/** "in the game room", "in the hallway"… for status lines. */
export const whereIs = (id) => ({ living_room: "in the living room", hallway: "in the hallway", game_room: "in the game room", range_room: "at the range" })[id] ?? "somewhere in Our Place";

/** Where you arrive in `roomId` coming through `doorId` (or its first door). */
export function arrivalIn(roomId, doorId) {
  const room = roomById(roomId);
  const doors = room.objects.filter((object) => object.type === "door");
  const door = doors.find((object) => object.id === doorId) ?? doors[0];
  return door?.arrive ?? room.spawnPoints[1];
}
