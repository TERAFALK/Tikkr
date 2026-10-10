import type { ModuleKey } from "./modules";
import { RELEASES, type NewsItem, type Release } from "./release-notes";

/**
 * NYHETERNA: vilka releaser en kund får se, och om det finns något nytt.
 *
 * Texterna ligger i release-notes.ts. Den här filen avgör tre saker:
 *
 * 1. **Bara installerade versioner.** Kör produktionen v1.2.0 visas ingen post
 *    för v1.3.0, även om texten redan ligger i koden. Det händer när en
 *    rättelse taggas på en `main` där nästa versions nyheter redan slagits
 *    ihop. I labbet och lokalt, där versionen inte är en tagg, visas allt:
 *    där ska texten provläsas.
 * 2. **Bara kundens tillval.** En punkt om löneunderlaget visas inte för den
 *    som inte har det.
 * 3. **Pricken i menyn.** Står när den senaste synliga versionen är nyare än
 *    den personen senast sett. Lagras per administratör, i
 *    `admin_users.news_seen_version`.
 *
 * Neutral fil, läses bara av panelen. Importerar ingenting från faktura- eller
 * lönesidan.
 */

/** Versionen som kör, från bygget. Samma värde som /api/health visar. */
export function runningVersion(): string {
  return process.env.TIKKR_VERSION ?? "dev";
}

/** [major, minor, patch] ur "v1.2.3", annars null. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negativt när a är äldre än b, noll när de är lika, positivt när a är nyare. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    throw new Error(`Inte en version på formen vX.Y.Z: ${left ? b : a}`);
  }

  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export interface VisibleRelease {
  version: string;
  date: string;
  title: string;
  summary?: string;
  added: string[];
  improved: string[];
  fixed: string[];
}

function itemsFor(items: NewsItem[] | undefined, modules: ModuleKey[]): string[] {
  return (items ?? []).flatMap((item) => {
    if (typeof item === "string") return [item];
    return modules.includes(item.module) ? [item.text] : [];
  });
}

/**
 * Releaserna kunden ska se, nyast först.
 *
 * Är den körande versionen en tagg visas bara den och äldre. Annars allt.
 */
export function visibleReleases(
  running: string,
  modules: ModuleKey[],
  releases: Release[] = RELEASES
): VisibleRelease[] {
  const installed = parseVersion(running)
    ? releases.filter((release) => compareVersions(release.version, running) <= 0)
    : releases;

  return installed
    .map((release) => ({
      version: release.version,
      date: release.date,
      title: release.title,
      summary: release.summary,
      added: itemsFor(release.added, modules),
      improved: itemsFor(release.improved, modules),
      fixed: itemsFor(release.fixed, modules),
    }))
    .filter(
      (release) =>
        release.added.length + release.improved.length + release.fixed.length > 0
    );
}

/**
 * true när versionen inte är läst.
 *
 * Tomt `seen` betyder att sidan aldrig öppnats, och då är allt nytt. Ett värde
 * som inte är en version räknas likadant: hellre en prick för mycket än att
 * en nyhet aldrig syns.
 */
export function isUnread(version: string, seen: string | null): boolean {
  if (!seen || !parseVersion(seen)) return true;
  return compareVersions(version, seen) > 0;
}

/** true när pricken ska stå: den senaste synliga versionen är oläst. */
export function hasUnreadNews(
  releases: VisibleRelease[],
  seen: string | null
): boolean {
  const latest = releases[0];
  return latest ? isUnread(latest.version, seen) : false;
}

/** "10 oktober 2026" ur "2026-10-10". Datumet har ingen tid och ingen zon. */
export function formatReleaseDate(date: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
