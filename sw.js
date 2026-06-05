const CACHE_NAME = 'novaflix-v4';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/f1_logic.js',
    '/js/config.js',
    '/js/sources.js',
    '/assets/img/nflix.png',
    '/assets/icons/favicon.png',
    '/manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all: app shell and content');
                return cache.addAll(ASSETS);
            })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache Hit - Return response
                if (response) {
                    // Check if the cached response is redirected (bad!)
                    if (response.redirected) {
                        console.log('[Service Worker] Found redirected response in cache, re-fetching...');
                        // Fall through to fetch
                    } else {
                        return response;
                    }
                }
                return fetch(event.request).then(
                    (response) => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // IMPORTANT: browser blocks redirected responses from SW for navigation
                        let responseToCache = response;

                        // If redirected, we must reconstruct the response to clear the redirected flag
                        if (response.redirected) {
                            console.log('[Service Worker] Cleaning redirected response');
                            responseToCache = new Response(response.body, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        }

                        // Clone the response for the cache
                        const clonedResponse = responseToCache.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                // Don't cache API calls or external resources blindly in this simple example
                                if (event.request.url.startsWith(self.location.origin)) {
                                    cache.put(event.request, clonedResponse);
                                }
                            });

                        return responseToCache;
                    }
                );
            })
    );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
});
