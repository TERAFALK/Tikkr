import type { GatewayRelease } from "./gateway-release";

/**
 * MSI:N FÖR TIKKR GATEWAY, hämtad från releasen i det privata repot.
 *
 * Repot TERAFALK/tikkr-gateway är privat, så varken kunden eller gatewayen kan
 * hämta filen direkt från GitHub. Tikkr hämtar den med en läsnyckel
 * (GATEWAY_RELEASES_TOKEN) och skickar den vidare: till administratören under
 * Integrationer, och till gatewayen när den uppdaterar sig själv.
 *
 * Filen skickas vidare som den kommer, utan att läsas in i minnet. Gatewayen
 * kontrollerar SHA-256 och signaturen själv; Tikkr är bara vägen dit.
 */

export const GATEWAY_REPO = "TERAFALK/tikkr-gateway";

export function msiFileName(version: string): string {
  return `TikkrGateway-${version}.msi`;
}

export type DownloadResult =
  | { ok: true; body: ReadableStream<Uint8Array>; size: number | null; fileName: string }
  | { ok: false; status: 404 | 502 | 503; message: string };

/** Hur länge adressen till en version sparas. Releasen ändras inte. */
const CACHE_MS = 15 * 60_000;
const assetCache = new Map<string, { url: string; at: number }>();

export async function downloadGatewayMsi(
  release: GatewayRelease | null,
  token = process.env.GATEWAY_RELEASES_TOKEN,
  fetchImpl: typeof fetch = fetch,
  now = Date.now()
): Promise<DownloadResult> {
  if (!release) return { ok: false, status: 404, message: "Ingen version av Tikkr Gateway är publicerad än." };
  if (!token) {
    console.error("GATEWAY_RELEASES_TOKEN saknas. Tikkr Gateway kan inte laddas ner.");
    return { ok: false, status: 503, message: "Nedladdningen är inte uppsatt. Kontakta Tikkr." };
  }

  const fileName = msiFileName(release.version);
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Tikkr",
  };

  let assetUrl = assetCache.get(release.version);
  if (!assetUrl || now - assetUrl.at > CACHE_MS) {
    const tag = await fetchImpl(
      `https://api.github.com/repos/${GATEWAY_REPO}/releases/tags/v${encodeURIComponent(release.version)}`,
      { headers: { ...headers, Accept: "application/vnd.github+json" }, cache: "no-store" }
    );
    if (tag.status === 404) return { ok: false, status: 404, message: `Version ${release.version} finns inte bland releaserna.` };
    if (!tag.ok) return { ok: false, status: 502, message: "GitHub svarade inte som väntat. Försök igen om en stund." };

    const json = (await tag.json()) as { assets?: { name: string; url: string }[] };
    const asset = json.assets?.find((a) => a.name === fileName);
    if (!asset) return { ok: false, status: 404, message: `${fileName} saknas i releasen.` };
    assetUrl = { url: asset.url, at: now };
    assetCache.set(release.version, assetUrl);
  }

  // GitHub svarar med en omdirigering till en tillfällig adress. Fetch tar
  // inte med Authorization dit, eftersom den ligger på en annan värd.
  const file = await fetchImpl(assetUrl.url, {
    headers: { ...headers, Accept: "application/octet-stream" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!file.ok || !file.body) {
    assetCache.delete(release.version);
    return { ok: false, status: 502, message: "Filen kunde inte hämtas från GitHub. Försök igen om en stund." };
  }

  const length = Number(file.headers.get("content-length"));
  return { ok: true, body: file.body, size: Number.isFinite(length) && length > 0 ? length : null, fileName };
}

/** Svaret till webbläsaren eller gatewayen. */
export function msiResponse(result: Extract<DownloadResult, { ok: true }>, sha256: string): Response {
  const headers = new Headers({
    "Content-Type": "application/x-msi",
    "Content-Disposition": `attachment; filename="${result.fileName}"`,
    "Cache-Control": "private, no-store",
    "X-Content-SHA256": sha256,
  });
  if (result.size) headers.set("Content-Length", String(result.size));
  return new Response(result.body, { status: 200, headers });
}

/** Nollställer cachen. Används av testerna. */
export function __resetDownloadCache(): void {
  assetCache.clear();
}
