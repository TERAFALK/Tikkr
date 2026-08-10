/**
 * Service worker för kioskskärmen.
 *
 * Uppgift: se till att skärmen går att ladda om även utan nät. Utan detta möts
 * den anställde av webbläsarens dinosaurie om någon råkar trycka F5 medan
 * wifit ligger nere.
 *
 * Själva stämplingarna hanteras INTE här utan av offline-kön i appen
 * (src/lib/offline-queue.ts). Det är medvetet: kön behöver kunna visa läget på
 * skärmen och rapportera fel till den som står framför den, vilket en service
 * worker inte kan.
 *
 * OBS: service workers kräver HTTPS (eller localhost). Testas skärmen över
 * vanlig http mot serverns IP registreras den här filen aldrig — kön fungerar
 * ändå, så länge sidan inte laddas om.
 */

const CACHE = "tikkr-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/kiosk", "/icon.svg"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Städa bort tidigare versioners cache vid uppdatering.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Stämplingar och andra anrop som ändrar något ska aldrig cachas.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Byggda filer får ett nytt namn vid varje bygge och kan därför cachas hårt.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Sidor: hämta färskt när det går, ta det sparade när nätet är borta.
  // Ordningen är viktig — vem som är instämplad ändras hela tiden, och en
  // gammal bild vore vilseledande så länge nätet faktiskt fungerar.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit ?? caches.match("/kiosk"))
        )
    );
  }
});
