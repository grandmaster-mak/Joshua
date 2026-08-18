// ============================================================
// Service Worker — offline-first static asset caching
// ============================================================

const CACHE_VERSION = "v6";
const CACHE_NAME = "chess-app-" + CACHE_VERSION;

// All important app files that should be available offline.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/ai.js",
  "/coach.js",
  "/multiplayer.js",
  "/auth.js",
  "/friends.js",
  "/chat.js",
  "/tournaments.js",
  "/puzzle.js",
  "/leaderboard.js",
  "/rewards.js",
  "/lessons.js",
  "/analysis-positions.js",
  "/analysis.js",
  "/chessdna.js",
  "/profile.js",
  "/achievements.js",
  "/clone.js",
  "/config.js",
  "/i18n.js",
  "/i18n-extra.js",
  "/auto-i18n.js",
  "/coach-puzzle-i18n.js",
  "/stockfish-18-lite-single.js",
  "/stockfish-18-lite-single.wasm",
  "/pieces/wP.svg",
  "/pieces/wN.svg",
  "/pieces/wB.svg",
  "/pieces/wR.svg",
  "/pieces/wQ.svg",
  "/pieces/wK.svg",
  "/pieces/bP.svg",
  "/pieces/bN.svg",
  "/pieces/bB.svg",
  "/pieces/bR.svg",
  "/pieces/bQ.svg",
  "/pieces/bK.svg",
  "/sounds/Move.ogg",
  "/sounds/Capture.ogg",
  "/sounds/Select.ogg",
  "/sounds/check.mp3",
  "/sounds/check mate.mp3",
  "/sounds/bg_music.mp3"
];

// Install — pre-cache static assets and take control immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activate — delete old caches and claim open pages
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for static files, stale-while-revalidate for navigations
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isSameOrigin = url.origin === location.origin;

  if (isNavigation) {
    // Serve cached page immediately, then update in background.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  if (isSameOrigin) {
    // Static assets: cache-first, fallback to network and then cache.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        });
      })
    );
  } else {
    // Cross-origin requests (Firebase, fonts, API) — just fetch normally.
    event.respondWith(fetch(event.request));
  }
});
