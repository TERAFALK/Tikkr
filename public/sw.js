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

/*
  Versionen bumpas när något som ligger sparat här har bytt innehåll utan att
  byta namn. Vid v2: logotyp och ikoner enligt Tikkr brand guidelines v1.0.
  Gamla cachen städas bort i "activate" nedan, och skärmen hämtar det nya.
*/
const CACHE = "tikkr-v2";

/*
  Logotypen och porträtten på stämplingsskärmen, i en egen cache.

  De ligger under /api/ och gick därför förbi allt här, och webbläsarens egen
  cache släpper dem efter fem minuter. En skärm som laddades om utan nät visade
  då namnen utan bilder och utan logotyp. Egen cache och inte CACHE, så att en
  ny version av sidorna inte kastar bilderna, och tvärtom.
*/
const IMAGES = "tikkr-bilder-v1";

/** Bilderna stämplingsskärmen visar. Allt annat under /api/ rörs inte. */
function isKioskImage(pathname) {
  return (
    pathname === "/api/company/logo" ||
    /^\/api\/anstallda\/[^/]+\/foto$/.test(pathname)
  );
}

/**
 * Färsk bild när nätet fungerar, den sparade när det inte gör det.
 *
 * Ett nytt porträtt syns därmed direkt, och en bild som tagits bort (404)
 * raderas också här: ett foto är en personuppgift, och en skärm ska inte
 * fortsätta visa någon som anonymiserats bara för att den en gång varit
 * offline.
 */
async function imageFromNetworkThenCache(request) {
  const cache = await caches.open(IMAGES);

  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }

  if (response.ok) {
    await cache.put(request, response.clone());
  } else if (response.status === 404) {
    await cache.delete(request);
  }
  return response;
}

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
        Promise.all(
          keys
            .filter((key) => key !== CACHE && key !== IMAGES)
            .map((key) => caches.delete(key))
        )
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

  if (isKioskImage(url.pathname)) {
    event.respondWith(imageFromNetworkThenCache(request));
    return;
  }

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
