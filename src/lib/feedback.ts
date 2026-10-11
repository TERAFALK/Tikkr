import type { FeedbackKind, FeedbackStatus } from "@prisma/client";
import { unsafeGlobalPrisma } from "./db";
import type { CompanyDb } from "./tenant";
import { HELP_AREAS, isHelpAreaKey } from "./help/areas";

/**
 * SUPPORTEN: MEDDELANDEN FRÅN KUNDEN, SVAR FRÅN OSS (issue #8, steg 2).
 *
 * Kunden skickar fel, förslag och synpunkter från sidan Support i panelen.
 * Vi läser dem i plattformens inkorg, byter status och svarar. Kunden ser
 * status och svar under formuläret, och en prick vid Support i menyn när
 * något hänt sedan hen senast tittade. Ingen mejlavisering, med flit: det var
 * produktägarens val, och inkorgen är platsen.
 *
 * TVÅ VÄGAR IN I SAMMA TABELL, och det är därför de står i samma fil:
 *
 *   kunden     → genom sin egen klient (CompanyDb), som stämplar företaget
 *                och aldrig visar ett annat företags rader
 *   plattformen → genom unsafeGlobalPrisma, eftersom inkorgen ser alla
 *
 * Företaget och avsändaren tas alltid ur sessionen, aldrig ur formuläret. Se
 * actions.ts på sidan Support.
 */

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  BUG: "Fel",
  SUGGESTION: "Förslag",
  FEEDBACK: "Synpunkt",
};

export const FEEDBACK_KINDS = Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[];

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  NEW: "Ny",
  IN_PROGRESS: "Pågår",
  DONE: "Klar",
};

export const FEEDBACK_STATUSES = Object.keys(
  FEEDBACK_STATUS_LABEL
) as FeedbackStatus[];

/** Etiketten för ett område, eller Annat när inget är valt. */
export function areaLabel(area: string | null): string {
  return area && isHelpAreaKey(area) ? HELP_AREAS[area].label : "Annat";
}

/** Längre än så är inte ett meddelande utan en bilaga. */
export const MAX_BODY_LENGTH = 5000;

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

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return Object.hasOwn(FEEDBACK_STATUS_LABEL, value);
}

function cleanBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw new FeedbackError("Skriv ett meddelande.");
  if (body.length > MAX_BODY_LENGTH) {
    throw new FeedbackError(
      `Meddelandet får vara högst ${MAX_BODY_LENGTH.toLocaleString("sv-SE")} tecken.`
    );
  }
  return body;
}

/**
 * Sidan meddelandet skickades från, eller null.
 *
 * Kommer ur adressfältet och är därmed vad som helst. Bara en sökväg i
 * panelen sparas, utan frågedel: den kan bära ett namn eller ett datum som
 * inte hör hemma i en supportrad.
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

  const body = cleanBody(input.body);

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

/** Arbetsytans meddelanden med svar, nyast först. */
export function listCompanyFeedback(db: CompanyDb, take = 50) {
  return db.feedbackMessage.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
}

/**
 * Pricken vid Support: har något av personens EGNA meddelanden fått svar
 * eller ny status sedan sidan senast öppnades?
 *
 * Bara de egna. Sidan visar hela arbetsytans meddelanden, men en kollegas
 * svar är inget att tända en prick för.
 */
export async function hasUnseenSupportUpdates(
  db: CompanyDb,
  userId: string,
  seenAt: Date | null
): Promise<boolean> {
  const count = await db.feedbackMessage.count({
    where: {
      authorUserId: userId,
      customerUpdatedAt: { gt: seenAt ?? new Date(0) },
    },
  });
  return count > 0;
}

export async function markSupportSeen(db: CompanyDb, userId: string, now = new Date()) {
  await db.adminUser.updateMany({
    where: { id: userId },
    data: { supportSeenAt: now },
  });
}

/* -------------------------------------------------------------------------- */
/* Plattformens inkorg                                                        */
/* -------------------------------------------------------------------------- */

export const INBOX_PAGE_SIZE = 25;

/** Standardvyn: det som inte är klart. Klar är arkivet. */
export const OPEN_STATUSES: FeedbackStatus[] = ["NEW", "IN_PROGRESS"];

export async function listInbox(filter: {
  statuses: FeedbackStatus[];
  kind?: FeedbackKind;
  companyId?: string;
  page: number;
}) {
  const where = {
    status: { in: filter.statuses },
    ...(filter.kind && { kind: filter.kind }),
    ...(filter.companyId && { companyId: filter.companyId }),
  };

  const [rows, total] = await Promise.all([
    unsafeGlobalPrisma.feedbackMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * INBOX_PAGE_SIZE,
      take: INBOX_PAGE_SIZE,
      include: {
        company: { select: { id: true, name: true } },
        replies: { orderBy: { createdAt: "asc" } },
      },
    }),
    unsafeGlobalPrisma.feedbackMessage.count({ where }),
  ]);

  return { rows, total };
}

/** Siffran vid Inkorg i plattformens meny. */
export function newFeedbackCount() {
  return unsafeGlobalPrisma.feedbackMessage.count({ where: { status: "NEW" } });
}

/** Kortet på kundsidan i plattformen. */
export function recentCompanyFeedback(companyId: string, take = 5) {
  return unsafeGlobalPrisma.feedbackMessage.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, area: true, status: true, body: true, createdAt: true },
  });
}

/**
 * Byter status och skriver det i plattformens händelselogg, i samma
 * transaktion. Kunden ser den nya statusen, och pricken tänds.
 */
export async function setFeedbackStatus(params: {
  id: string;
  status: FeedbackStatus;
  byEmail: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  const message = await unsafeGlobalPrisma.feedbackMessage.findUnique({
    where: { id: params.id },
    select: { id: true, companyId: true, status: true, kind: true, authorEmail: true },
  });
  if (!message) throw new FeedbackError("Meddelandet finns inte.");
  if (message.status === params.status) return;

  await unsafeGlobalPrisma.$transaction([
    unsafeGlobalPrisma.feedbackMessage.update({
      where: { id: message.id },
      data: {
        status: params.status,
        statusChangedAt: now,
        statusChangedByEmail: params.byEmail,
        customerUpdatedAt: now,
      },
    }),
    unsafeGlobalPrisma.platformAuditLog.create({
      data: {
        actorEmail: params.byEmail,
        action: "Ändrade status på supportmeddelande",
        targetCompanyId: message.companyId,
        detail:
          `${FEEDBACK_KIND_LABEL[message.kind]} från ${message.authorEmail}: ` +
          `${FEEDBACK_STATUS_LABEL[message.status]} → ${FEEDBACK_STATUS_LABEL[params.status]}`,
      },
    }),
  ]);
}

/**
 * Svarar kunden.
 *
 * Ett nytt meddelande som besvaras blir Pågår av sig självt: det är inte
 * längre nytt, och lämnades det som Ny skulle siffran i menyn ljuga om vad som
 * väntar. Klar sätts aldrig av ett svar. Det är ett eget beslut.
 */
export async function replyToFeedback(params: {
  id: string;
  body: string;
  byEmail: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const body = cleanBody(params.body);

  const message = await unsafeGlobalPrisma.feedbackMessage.findUnique({
    where: { id: params.id },
    select: { id: true, companyId: true, status: true, kind: true, authorEmail: true },
  });
  if (!message) throw new FeedbackError("Meddelandet finns inte.");

  const startsWork = message.status === "NEW";

  await unsafeGlobalPrisma.$transaction([
    unsafeGlobalPrisma.feedbackReply.create({
      data: {
        companyId: message.companyId,
        messageId: message.id,
        body,
        authorEmail: params.byEmail,
        createdAt: now,
      },
    }),
    unsafeGlobalPrisma.feedbackMessage.update({
      where: { id: message.id },
      data: {
        customerUpdatedAt: now,
        ...(startsWork && {
          status: "IN_PROGRESS",
          statusChangedAt: now,
          statusChangedByEmail: params.byEmail,
        }),
      },
    }),
    unsafeGlobalPrisma.platformAuditLog.create({
      data: {
        actorEmail: params.byEmail,
        action: "Svarade på supportmeddelande",
        targetCompanyId: message.companyId,
        detail: `${FEEDBACK_KIND_LABEL[message.kind]} från ${message.authorEmail}`,
      },
    }),
  ]);
}
