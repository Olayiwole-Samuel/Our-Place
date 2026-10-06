/*
 * Our Place service worker — intentionally minimal.
 *
 * It does exactly one thing: if a page navigation fails because the device is
 * offline, show /offline.html. It does NOT cache app code, API responses, game
 * state or media — Our Place is a live, two-person experience and must never
 * pretend to work offline. Bump CACHE_VERSION when offline.html changes.
 */
const CACHE_VERSION = "our-place-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.open(CACHE_VERSION).then((cache) => cache.match(OFFLINE_URL))),
  );
});
