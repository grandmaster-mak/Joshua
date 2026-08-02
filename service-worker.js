// Versioned cache with a network-first strategy. Every fetch tries the
// network FIRST and only falls back to the cache if offline — so a new
// deploy is visible on the very next page load, automatically, with no
// manual cache-clearing needed by anyone. Bump CACHE_VERSION whenever
// you want to force a full cache purge (not required for normal
// updates to show up — that already happens via network-first — but
// good practice after big changes).

const CACHE_VERSION = "v2";
const CACHE_NAME = "chess-app-" + CACHE_VERSION;

const PRECACHE_URLS = [
    "/",
    "/index.html"
];

self.addEventListener("install", function(event){
    self.skipWaiting(); // don't wait for old tabs to close — activate immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache){
            return cache.addAll(PRECACHE_URLS);
        })
    );
});

self.addEventListener("activate", function(event){
    event.waitUntil(
        caches.keys().then(function(keys){
            return Promise.all(
                keys.filter(function(key){ return key !== CACHE_NAME; })
                    .map(function(key){ return caches.delete(key); })
            );
        }).then(function(){
            return self.clients.claim(); // take control of already-open tabs too
        })
    );
});

self.addEventListener("fetch", function(event){
    event.respondWith(
        fetch(event.request).then(function(response){
            const copy = response.clone();
            caches.open(CACHE_NAME).then(function(cache){
                cache.put(event.request, copy);
            });
            return response;
        }).catch(function(){
            return caches.match(event.request);
        })
    );
});
