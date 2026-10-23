/**
 * Picture frames around the house (couple_frames). Each wall of frames has a
 * few slots, `<wall id>_<n>`. A slot shows the photo you chose for it, or else
 * one of your newest photos — skipping the five on the living room's photo
 * wall when you have enough, so the hallway isn't a copy of it.
 */
export const FRAME_WALLS = Object.freeze({
  hall_art_left: { name: "Left wall", slots: 3 },
  hall_art_right: { name: "Right wall", slots: 3 },
});

export const slotIds = (wallId) => Array.from({ length: FRAME_WALLS[wallId]?.slots ?? 3 }, (_, i) => `${wallId}_${i}`);

/** { [slotId]: { memory, chosen } } for every frame on every wall. */
export function framePhotos(frames, memories) {
  const usable = memories.filter((memory) => memory.url);
  const byId = new Map(usable.map((memory) => [memory.id, memory]));
  const chosenIds = new Set(Object.values(frames));
  const result = {};
  const empty = [];
  for (const wallId of Object.keys(FRAME_WALLS)) {
    for (const slot of slotIds(wallId)) {
      const memory = byId.get(frames[slot]);
      if (memory) result[slot] = { memory, chosen: true };
      else empty.push(slot);
    }
  }
  const pool = usable.filter((memory) => !chosenIds.has(memory.id));
  const start = pool.length >= 5 + empty.length ? 5 : 0;
  empty.forEach((slot, i) => {
    const memory = pool.length ? pool[(start + i) % pool.length] : null;
    result[slot] = { memory, chosen: false };
  });
  return result;
}
