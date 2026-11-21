// Werkbonnen service worker: app-bestanden offline beschikbaar, netwerk eerst. Google-verkeer gaat er buiten om.
const CACHE = "wb-v1.8.0";
const FILES = ["./", "index.html", "style.css?v=1.8.0", "i18n.js?v=1.8.0", "config.js?v=1.8.0", "drive.js?v=1.8.0", "app.js?v=1.8.0", "manifest.webmanifest",
  "vendor/pdf-lib-1.17.1.min.js", "vendor/pdf-3.11.174.min.js", "vendor/pdf.worker-3.11.174.min.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
