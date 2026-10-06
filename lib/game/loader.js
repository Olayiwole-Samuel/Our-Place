/**
 * Client-side lazy loading for game UI modules. Nothing about a game is in the
 * initial bundle: selecting a game in the menu calls `loadGameClient`, which runs
 * that definition's `import()` and fetches only that game's chunk (and, from there,
 * its assets). Promises are cached so reopening a game is instant.
 */
const clientModules = new Map();

export function loadGameClient(definition) {
  if (!clientModules.has(definition.id)) {
    const pending = definition.loadClient().catch((error) => {
      // Do not cache failures — a flaky connection should be retryable.
      clientModules.delete(definition.id);
      throw error;
    });
    clientModules.set(definition.id, pending);
  }
  return clientModules.get(definition.id);
}

/** Warm the cache (e.g. on hover/focus in the game menu) without awaiting. */
export function preloadGameClient(definition) {
  loadGameClient(definition).catch(() => {});
}
