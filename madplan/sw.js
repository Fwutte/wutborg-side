/* Madplan – service worker
   App-shell caching: selve siden virker offline. Data (kald til dit
   API) sendes altid til netværket, så I ser den nyeste madplan.
   Bump CACHE-versionen når du ændrer skallen. */

const CACHE = "madplan-shell-v3";
const SHELL = [
  "/madplan/",
  "/madplan/index.html",
  "/madplan/auth.js",
  "/madplan/manifest.json",
  "/madplan/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Delt data må aldrig komme fra app-shell-cachen.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(e.request));
    return;
  }

  if (e.request.method !== "GET") return;

  // Skal: cache først, ellers netværk. Navigation falder tilbage til skallen.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).catch(() =>
          e.request.mode === "navigate"
            ? caches.match("/madplan/index.html")
            : Promise.reject(new Error("Offline"))
        )
    )
  );
});
