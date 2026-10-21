import { sitDown } from "@/lib/world/actions";
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
  door: {
    kind: "card",
    title: "More of Our Place",
    body: "This door will lead to other rooms you can explore together. Coming soon.",
  },
};
