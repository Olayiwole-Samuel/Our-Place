import { sitDown } from "@/lib/world/actions";
import { travel } from "@/lib/world/travel";
import { LANES } from "@/lib/range/targets";
import { useRangeStore } from "@/store/rangeStore";
import { useGameStore } from "@/store/gameStore";
import { useRoomStore } from "@/store/roomStore";

/**
 * What interacting with each object type does. Detection (lib/world/interactions)
 * and UI (InteractPrompt / ObjectCard) are generic; only this map is per-object,
 * so later phases replace a "card" with the real feature (photo viewer, watch
 * together, game menu, left messages, trophies, room transitions) in one place.
 *
 *   { kind: "action", run(context) }   does something in the world now
 *   { kind: "card", title, body }      honest description of what lives here
 */
export const INTERACTION_HANDLERS = {
  couch: {
    kind: "action",
    run: ({ runtime, world }) => {
      if (sitDown(runtime)) world.setSeated(true);
    },
  },
  photoWall: { kind: "action", run: () => useRoomStore.getState().openPanel("memories") },
  videoScreen: { kind: "action", run: () => useRoomStore.getState().openPanel("tv") },
  bookshelf: { kind: "action", run: () => useRoomStore.getState().openPanel("shelf") },
  loveHeart: { kind: "action", run: () => useRoomStore.getState().openPanel("us") },
  // A wall of picture frames: choose which of your photos hangs in each.
  artFrames: { kind: "action", run: ({ object }) => useRoomStore.getState().openPanel("frames", object?.id ?? null) },
  dog: { kind: "action", run: () => useRoomStore.getState().openPanel("dog") },
  plant: {
    kind: "card",
    title: "Your plant",
    body: "Just planted. Soon it will grow as you spend time here together.",
  },
  messageBoard: { kind: "action", run: () => useRoomStore.getState().openPanel("notes") },
  gameCorner: {
    // The in-world game corner opens the floating game menu at its first category.
    kind: "action",
    run: () => useGameStore.getState().openCategory("talk_party"),
  },
  // Through to another room (lib/world/rooms, lib/world/travel.js).
  door: { kind: "action", run: ({ runtime, object }) => object?.destination && travel(runtime, object.destination.room, object.destination.door) },
  soonDoor: {
    kind: "card",
    title: "Coming soon",
    body: "This room isn't ready yet — it's next on the list. For now, try the game room and the range.",
  },
  // The game room: the big screen opens the games menu; cabinets and the table their own kinds of games.
  gameScreen: { kind: "action", run: () => useGameStore.getState().openMenu() },
  arcade: { kind: "action", run: ({ object }) => useGameStore.getState().openCategory(object?.category ?? "quick_casual") },
  gameTable: { kind: "action", run: ({ object }) => useGameStore.getState().openCategory(object?.category ?? "board_strategy") },
  // The range: step up to your lane (your partner sees you there) and take aim.
  rangeLane: {
    kind: "action",
    run: ({ runtime, object }) => {
      const lane = object?.lane ?? 0;
      Object.assign(runtime.localPose, { x: LANES[lane], z: 2.05, ry: Math.PI, anim: "idle" });
      useRangeStore.getState().enter(lane);
    },
  },
};
