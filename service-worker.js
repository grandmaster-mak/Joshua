// ============================================================
// Service worker: makes the app itself (board, local play, vs AI)
// loadable with no internet connection, once it's been opened at least
// once with a connection.
//
// What this deliberately does NOT do: cache anything from Firebase or
// any other cross-origin request. Those always hit the real network —
// online multiplayer, chat, tournaments, leaderboards, puzzles, and
// lessons all need a live server and simply won't work offline, same as
// any other online-only feature in any app. This only makes the app's
// own HTML/CSS/JS/images/sounds/engine files available offline.
// ============================================================

const CACHE_NAME = "chess-app-shell-v1";

// The core files needed just to load the app shell and play a local or
// vs-AI game. Anything else (piece images, sounds, etc.) gets cached
// automatically the first time it's actually fetched — see the fetch
// handler below — so it doesn't all need to be listed here up front.
const CORE_ASSETS = [
    "./",
    "index.html",
    "style.css",
    "script.js",
    "ai.js",
    "ai-worker.js",
    "coach.js",
    "multiplayer.js",
    "auth.js",
    "friends.js",
    "chat.js",
    "tournaments.js",
    "puzzle.js",
    "leaderboard.js",
    "rewards.js",
    "lessons.js",
    "analysis.js",
    "stockfish-18-lite-single.js",
    "stockfish-18-lite-single.wasm"
];

self.addEventListener("install", function(event){
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache){
            // addAll fails entirely if even one file 404s — cache what we
            // can individually instead, so one missing/renamed file
            // doesn't block the whole app from getting offline support.
            return Promise.all(
                CORE_ASSETS.map(function(url){
                    return cache.add(url).catch(function(err){
                        console.warn("Service worker: couldn't cache", url, err.message);
                    });
                })
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", function(event){
    event.waitUntil(
        caches.keys().then(function(names){
            return Promise.all(
                names.filter(function(n){ return n !== CACHE_NAME; })
                     .map(function(n){ return caches.delete(n); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", function(event){

    const req = event.request;
    const url = new URL(req.url);

    // Cross-origin (Firebase, Google Fonts, etc.) always goes straight to
    // the network — never served from cache, so live data never masquerades
    // as current, and this worker never interferes with Firebase requests.
    if(url.origin !== self.location.origin){
        return;
    }

    event.respondWith(
        caches.match(req).then(function(cached){

            if(cached) return cached;

            return fetch(req).then(function(networkResponse){
                // Cache whatever we successfully fetch (piece images,
                // sounds, etc.) so it's available offline next time too.
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(function(cache){
                    cache.put(req, responseClone);
                });
                return networkResponse;
            }).catch(function(){
                // Offline and not cached. For a page navigation, fall back
                // to the cached app shell rather than showing a browser
                // error page.
                if(req.mode === "navigate"){
                    return caches.match("index.html");
                }
            });

        })
    );

});
