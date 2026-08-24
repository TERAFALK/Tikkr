import { unsafeGlobalPrisma } from "./db";

/**
 * DRIFTMEDDELANDEN.
 *
 * Bannern som säger "underhåll på söndag" eller "vi har ett avbrott just nu".
 * Skapas i plattformspanelen och visas för alla kunder samtidigt.
 *
 * Två val som styr utformningen:
 *
 * 1. **Tidsstyrt, inte manuellt.** Ett meddelande läggs in i förväg med start-
 *    och sluttid, och dyker upp av sig självt. Det som kräver att någon minns
 *    att trycka på en knapp klockan sju en söndagsmorgon kommer inte att visas.
 *
 * 2. **Skilt på panel och skärm.** Ett underhåll som bara rör rapporterna
 *    behöver inte stå på väggen i verkstaden, där det bara skulle oroa någon
 *    som ändå inte kan göra något åt det. Ett avbrott som påverkar stämplingen
 *    ska däremot synas just där.
 *
 * Går avsiktligt utanför företagsfiltreringen: meddelandet gäller hela
 * installationen och inte en enskild kund.
 */

export type NoticeKind = "MAINTENANCE" | "INCIDENT" | "INFO";

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  startsAt: Date;
  endsAt: Date | null;
}

export type NoticeSurface = "admin" | "kiosk" | "site";

const SURFACE_FIELD: Record<NoticeSurface, "showInAdmin" | "showOnKiosk" | "showOnSite"> =
  {
    admin: "showInAdmin",
    kiosk: "showOnKiosk",
    site: "showOnSite",
  };

/**
 * Meddelanden som ska visas just nu på angiven yta.
 *
 * Anropas vid varje sidladdning i panelen och på varje kioskvy. Frågan går på
 * ett index och returnerar nästan alltid noll rader — kostnaden är försumbar
 * jämfört med att missa ett avbrottsmeddelande.
 */
export async function activeNotices(
  surface: NoticeSurface,
  now: Date = new Date()
): Promise<Notice[]> {
  const rows = await unsafeGlobalPrisma.systemNotice.findMany({
    where: {
      archivedAt: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      [SURFACE_FIELD[surface]]: true,
    },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      startsAt: true,
      endsAt: true,
    },
  });

  return rows;
}

/**
 * Meddelanden för plattformspanelens lista.
 *
 * Arkiverade hämtas bara när de efterfrågas. De är underlag och inget man
 * behöver se dagligen — låg de bland de aktiva växte listan för varje underhåll
 * som någonsin utförts, och det som faktiskt visas för kunderna just nu blev
 * svårare att få syn på.
 */
export async function listNotices({ archived = false } = {}) {
  return unsafeGlobalPrisma.systemNotice.findMany({
    where: archived ? { archivedAt: { not: null } } : { archivedAt: null },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
}

/** Antal arkiverade, för länken som leder till dem. */
export async function archivedNoticeCount(): Promise<number> {
  return unsafeGlobalPrisma.systemNotice.count({
    where: { archivedAt: { not: null } },
  });
}

export class NoticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoticeError";
  }
}

export async function createNotice(params: {
  kind: NoticeKind;
  title: string;
  body: string;
  startsAt: Date;
  endsAt: Date | null;
  showInAdmin: boolean;
  showOnKiosk: boolean;
  showOnSite: boolean;
  createdByEmail: string;
}) {
  const title = params.title.trim();
  const body = params.body.trim();

  if (title.length < 3) {
    throw new NoticeError("Skriv en rubrik.");
  }

  if (!body) {
    throw new NoticeError("Skriv vad meddelandet gäller.");
  }

  if (!params.showInAdmin && !params.showOnKiosk && !params.showOnSite) {
    throw new NoticeError(
      "Välj minst en plats där meddelandet ska visas. Ett meddelande som inte " +
        "syns någonstans fyller ingen funktion."
    );
  }

  if (Number.isNaN(params.startsAt.getTime())) {
    throw new NoticeError("Kontrollera starttiden.");
  }

  if (params.endsAt) {
    if (Number.isNaN(params.endsAt.getTime())) {
      throw new NoticeError("Kontrollera sluttiden.");
    }

    if (params.endsAt <= params.startsAt) {
      throw new NoticeError("Sluttiden måste ligga efter starttiden.");
    }
  }

  return unsafeGlobalPrisma.systemNotice.create({
    data: {
      kind: params.kind,
      title,
      body,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      showInAdmin: params.showInAdmin,
      showOnKiosk: params.showOnKiosk,
      showOnSite: params.showOnSite,
      createdByEmail: params.createdByEmail,
    },
  });
}

/**
 * Tar meddelandet ur cirkulation.
 *
 * Raderar inte. Det ska gå att se i efterhand vad kunderna faktiskt fick se,
 * särskilt om någon senare ifrågasätter vad de blev informerade om.
 */
export async function archiveNotice(id: string) {
  await unsafeGlobalPrisma.systemNotice.updateMany({
    where: { id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
}

/** Läget ett meddelande befinner sig i, för att kunna märkas i listan. */
export function noticeState(
  notice: { startsAt: Date; endsAt: Date | null; archivedAt: Date | null },
  now: Date = new Date()
): "arkiverat" | "kommande" | "pågår" | "avslutat" {
  if (notice.archivedAt) return "arkiverat";
  if (notice.startsAt > now) return "kommande";
  if (notice.endsAt && notice.endsAt < now) return "avslutat";
  return "pågår";
}
