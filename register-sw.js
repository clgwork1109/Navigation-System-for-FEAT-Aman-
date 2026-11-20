// Registers the offline cache. Service workers only run on HTTPS or localhost.
if ("serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js", { scope: "./" })
    .catch(err => console.error("Service worker failed:", err));
}
