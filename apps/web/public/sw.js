const CACHE = "moneytrace-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isFinancial = url.hostname.includes("googleapis.com") || url.pathname.includes("/asia-south2/");
  if (event.request.method !== "GET" || isFinancial) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))));
});
