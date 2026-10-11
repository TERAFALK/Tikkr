import type { FeedbackKind } from "@prisma/client";
import { unsafeGlobalPrisma } from "./db";
import type { CompanyDb } from "./tenant";
import { HELP_AREAS, isHelpAreaKey } from "./help/areas";
import { FEEDBACK_KIND_LABEL, FEEDBACK_KINDS, MAX_BODY_LENGTH } from "./feedback-form";

/**
 * FEL, FÖRSLAG OCH SYNPUNKTER FRÅN KUNDEN (issue #8, steg 2).
 *
 * Kunden skickar dem från en liten ruta som öppnas längst ner i panelens meny.
 * Vi läser dem i plattformens inkorg och klarmarkerar dem med en anteckning om
 * vad som gjordes, varpå de ligger i arkivet.
 *
 * KUNDEN FÅR INGEN ÅTERKOPPLING (ändrat 2026-10-11, produktägarens val).
 * Första versionen visade status och svar för kunden, och blev därmed ett
 * supportärende i stället för en brevlåda. Ingen mejlavisering åt något håll.
 *
 * TVÅ VÄGAR IN I SAMMA TABELL, och det är därför de står i samma fil:
 *
 *   kunden     → genom sin egen klient (CompanyDb), som stämplar företaget
 *                och aldrig visar ett annat företags rader
 *   plattformen → genom unsafeGlobalPrisma, eftersom inkorgen ser alla
 *
 * Företaget och avsändaren tas alltid ur sessionen, aldrig ur formuläret. Se
 * admin/(panel)/feedback/actions.ts.
 */

export { FEEDBACK_KIND_LABEL, FEEDBACK_KINDS, MAX_BODY_LENGTH };

/** Etiketten för ett område, eller Annat när inget är valt. */
export function areaLabel(area: string | null): string {
  return area && isHelpAreaKey(area) ? HELP_AREAS[area].label : "Annat";
}

/**
 * Högst så många meddelanden per användare och timme.
 *
 * Bara inloggade kan skicka, så det är ingen spärr mot främlingar. Den finns
 * för en knapp som av något skäl trycks i en slinga, och räknas ur tabellen
 * själv i stället för i en egen räknare.
 */
export const HOURLY_LIMIT = 10;

/** Fel som går att visa för den som skrev. */
export class FeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackError";
  }
}

function isKind(value: string): value is FeedbackKind {
  return Object.hasOwn(FEEDBACK_KIND_LABEL, value);
}

function cleanText(raw: string, empty: string): string {
  const text = raw.trim();
  if (!text) throw new FeedbackError(empty);
  if (text.length > MAX_BODY_LENGTH) {
    throw new FeedbackError(
      `Texten får vara högst ${MAX_BODY_LENGTH.toLocaleString("sv-SE")} tecken.`
    );
  }
  return text;
}

/**
 * Sidan meddelandet skickades från, eller null.
 *
 * Kommer ur adressfältet och är därmed vad som helst. Bara en sökväg i
 * panelen sparas, utan frågedel: den kan bära ett namn eller ett datum som
 * inte hör hemma i inkorgen.
 */
export function cleanPage(raw: string | null | undefined): string | null {
  const path = (raw ?? "").trim().split(/[?#]/)[0];
  if (!/^\/admin(\/[a-z0-9\-/]*)?$/.test(path)) return null;
  if (path.length > 200 || path.includes("//")) return null;
  return path;
}

/* -------------------------------------------------------------------------- */
/* Kundens sida                                                               */
/* -------------------------------------------------------------------------- */

export interface FeedbackAuthor {
  db: CompanyDb;
  companyId: string;
  userId: string;
  email: string;
  name: string | null;
}

export async function sendFeedback(
  author: FeedbackAuthor,
  input: { kind: string; area: string; page: string | null; body: string },
  now = new Date()
) {
  if (!isKind(input.kind)) {
    throw new FeedbackError("Välj om det gäller ett fel, ett förslag eller en synpunkt.");
  }

  // Tomt betyder Annat. Ett okänt värde är däremot inget val någon gjort i
  // formuläret, och sparas inte som om det vore ett.
  const area = input.area.trim();
  if (area && !isHelpAreaKey(area)) throw new FeedbackError("Välj ett område.");

  const body = cleanText(input.body, "Skriv ett meddelande.");

  const recent = await author.db.feedbackMessage.count({
    where: {
      authorUserId: author.userId,
      createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) },
    },
  });
  if (recent >= HOURLY_LIMIT) {
    throw new FeedbackError(
      "Du har skickat många meddelanden den senaste timmen. Försök igen senare, " +
        "eller mejla support@tikkr.se."
    );
  }

  return author.db.feedbackMessage.create({
    data: {
      companyId: author.companyId,
      authorUserId: author.userId,
      authorEmail: author.email,
      authorName: author.name,
      kind: input.kind,
      area: area || null,
      page: cleanPage(input.page),
      body,
      createdAt: now,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Plattformens inkorg                                                        */
/* -------------------------------------------------------------------------- */

export const INBOX_PAGE_SIZE = 25;

export async function listInbox(filter: {
  /** true är arkivet, false inkorgen. */
  archived: boolean;
  kind?: FeedbackKind;
  companyId?: string;
  page: number;
}) {
  const where = {
    doneAt: filter.archived ? { not: null } : null,
    ...(filter.kind && { kind: filter.kind }),
    ...(filter.companyId && { companyId: filter.companyId }),
  };

  const [rows, total] = await Promise.all([
    unsafeGlobalPrisma.feedbackMessage.findMany({
      where,
      // Arkivet i den ordning det klarmarkerades, inkorgen i den ordning det
      // kom in.
      orderBy: filter.archived ? { doneAt: "desc" } : { createdAt: "desc" },
      skip: (filter.page - 1) * INBOX_PAGE_SIZE,
      take: INBOX_PAGE_SIZE,
      include: { company: { select: { id: true, name: true } } },
    }),
    unsafeGlobalPrisma.feedbackMessage.count({ where }),
  ]);

  return { rows, total };
}

/** Siffran vid Inkorg i plattformens meny: det som inte är klarmarkerat. */
export function openFeedbackCount() {
  return unsafeGlobalPrisma.feedbackMessage.count({ where: { doneAt: null } });
}

/** Kortet på kundsidan i plattformen. */
export function recentCompanyFeedback(companyId: string, take = 5) {
  return unsafeGlobalPrisma.feedbackMessage.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, area: true, doneAt: true, body: true, createdAt: true },
  });
}

/**
 * Klarmarkerar ett meddelande och flyttar det till arkivet.
 *
 * Anteckningen krävs: ett arkiv där det inte står vad som gjordes går inte att
 * läsa ett halvår senare. Skrivs i plattformens händelselogg i samma
 * transaktion. Ett meddelande som redan är klart rörs inte, så att två flikar
 * inte skriver över varandras anteckning.
 */
export async function markFeedbackDone(params: {
  id: string;
  note: string;
  byEmail: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const note = cleanText(params.note, "Skriv vad som gjordes.");

  const message = await unsafeGlobalPrisma.feedbackMessage.findUnique({
    where: { id: params.id },
    select: { id: true, companyId: true, doneAt: true, kind: true, authorEmail: true },
  });
  if (!message) throw new FeedbackError("Meddelandet finns inte.");
  if (message.doneAt) throw new FeedbackError("Meddelandet är redan klarmarkerat.");

  await unsafeGlobalPrisma.$transaction([
    unsafeGlobalPrisma.feedbackMessage.update({
      where: { id: message.id },
      data: { doneAt: now, doneNote: note, doneByEmail: params.byEmail },
    }),
    unsafeGlobalPrisma.platformAuditLog.create({
      data: {
        actorEmail: params.byEmail,
        action: "Klarmarkerade fel eller förslag",
        targetCompanyId: message.companyId,
        detail: `${FEEDBACK_KIND_LABEL[message.kind]} från ${message.authorEmail}`,
      },
    }),
  ]);
}
