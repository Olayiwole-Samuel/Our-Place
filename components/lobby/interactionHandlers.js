import { sitDown } from "@/lib/world/actions";
import { useGameStore } from "@/store/gameStore";

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
  photoWall: {
    kind: "card",
    title: "Your photo wall",
    body: "This is where your memories will hang. Adding photos is coming soon.",
  },
  videoScreen: {
    kind: "card",
    title: "Nothing playing yet",
    body: "You'll be able to watch videos together here, in sync. Coming soon.",
  },
  bookshelf: {
    kind: "card",
    title: "Your bookshelf",
    body: "Trophies, milestones and game wins will collect on these shelves. The top shelf is waiting.",
  },
  plant: {
    kind: "card",
    title: "Your plant",
    body: "Just planted. Soon it will grow as you spend time here together.",
  },
  messageBoard: {
    kind: "card",
    title: "No notes yet",
    body: "Leave each other notes to find later. Coming soon.",
  },
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
