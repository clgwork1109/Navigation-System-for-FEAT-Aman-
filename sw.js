/*
 * Service worker for the Navigation app.
 *
 * Security rules:
 *  - Only handles GET requests for files on this same origin.
 *    Anything else (other domains, POST, etc.) goes straight to the network.
 *  - Caches only successful same-origin responses (HTTP 200, type "basic").
 *    Errors and opaque responses are never stored.
 *  - Stores no personal data: the app has no login and no user input.
 *  - Each release uses a new CACHE_VERSION. On activate, older caches are
 *    deleted, so visitors do not keep outdated content.
 *  - On install, the app files and every photo listed in data.json are
 *    downloaded. If any download fails, the install is cancelled and the
 *    previous working version stays active.
 */

const CACHE_VERSION = "nav-v1.0.8";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./register-sw.js",
  "./data.json",
  "./libs/pannellum/pannellum.js",
  "./libs/pannellum/pannellum.css"
];

self.addEventListener("install", event => {
  event.waitUntil(precacheAll().then(() => self.skipWaiting()));
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

  if (url.pathname.includes("/images/")) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  } else if (url.pathname.endsWith("/data.json")) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  } else {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

// Download the app shell and every panorama photo listed in data.json.
async function precacheAll() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL_FILES);

  const dataResponse = await fetch("./data.json", { cache: "no-store" });
  if (!dataResponse.ok) throw new Error("data.json could not be loaded");
  const data = await dataResponse.json();

  const imageUrls = new Set();
  Object.values(data.nodes || {}).forEach(node => {
    if (node.image) imageUrls.add(new URL(node.image, self.registration.scope).href);
  });

  const images = await caches.open(IMAGE_CACHE);
  const failed = [];

  for (const url of imageUrls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      await images.put(url, response);
    } catch (err) {
      failed.push(url);
    }
  }

  if (failed.length) {
    throw new Error("Could not download: " + failed.join(", "));
  }
}

// Serve from cache when available, otherwise fetch and store the result.
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

// Data that may change: try the network first so map updates appear,
// and fall back to the cached copy when offline.
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
