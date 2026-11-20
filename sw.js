/*
 * Service worker for the Navigation app.
 *
 * Security rules used here:
 *  - Only handles GET requests for files on this same origin.
 *    Anything else (other domains, POST, etc.) goes straight to the network.
 *  - Caches only successful (HTTP 200, basic same-origin) responses.
 *    Errors and opaque responses are never stored.
 *  - Nothing personal is stored: the app has no login and no user data.
 *  - Each release uses a new CACHE_VERSION. On activate, old caches are deleted,
 *    so visitors do not keep outdated or removed content.
 *  - The image cache has a size limit so storage cannot grow without bound.
 */

const CACHE_VERSION = "nav-v1.0.1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const MAX_IMAGES = 60;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.json",
  "./libs/pannellum/pannellum.js",
  "./libs/pannellum/pannellum.css"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET requests and anything from another origin.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const isImage = url.pathname.includes("/images/");
  const isData = url.pathname.endsWith("/data.json");

  if (isImage) {
    event.respondWith(cacheFirstImage(request));
  } else if (isData) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  } else {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

// Shell files: serve from cache, fall back to network.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

// Data that may change (data.json): try network first so map updates appear.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Panorama photos: serve from cache, store new ones, and limit cache size.
async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    trimCache(cache, MAX_IMAGES);
  }
  return response;
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  while (keys.length > maxEntries) {
    await cache.delete(keys.shift());
  }
}
