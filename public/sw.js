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

/*
 * Push notifications (Web Push): "❤️ King is in Our Place" and new messages,
 * sent by the server only while the partner isn't in the app. If Our Place is
 * already open and visible on this device, nothing is shown.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      if (windows.some((client) => client.visibilityState === "visible")) return undefined;
      return self.registration.showNotification(data.title || "Our Place", {
        body: data.body || "",
        tag: data.tag || "our-place",
        renotify: true,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url || "/lobby" },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/lobby", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.focus().then(() => open.navigate?.(url));
      return self.clients.openWindow(url);
    }),
  );
});
