import type { BreakEntry } from "@prisma/client";
import { forCompany, type CompanyDb } from "./tenant";
import { unsafeGlobalPrisma } from "./db";
import {
  ClockError,
  clockOutAll,
  isUniqueViolation,
  type PunchContext,
} from "./clock";
import { nextOccurrenceOf } from "./time-zone";
import { endOpenBreak } from "./break-close";

/**
 * RASTER — FRUKOST, LUNCH OCH FIKA.
 *
 * Rasterna stämplas på skärmen, precis som jobben. Skälet är kundens: en rast
 * som dras av enligt schema är en gissning, och den som arbetar genom lunchen
 * får då avdrag för en lunch hen aldrig tog.
 *
 * EN RASTSTÄMPLING STÄNGER ALLA PÅGÅENDE JOBB. Det är designens viktigaste
 * beslut och det som gör resten enkel: under rasten finns ingen öppen
 * stämpling, alltså faller rasten bort av sig själv ur närvarotiden. Varken
 * `spans.ts`, rapporterna eller fakturaunderlaget behöver veta att raster
 * existerar.
 *
 * RASTTID ÄR INTE ARBETE. Den är därför varken ordertid eller improduktiv tid
 * utan ett eget register, av samma skäl som improduktiv tid fick ett eget:
 * ligger något bland arbetsmomenten kommer det förr eller senare med i ett
 * fakturaunderlag. En lunch har ingen order, inget moment och ingen
 * timkostnad — den kan inte faktureras ens av misstag.
 */

export interface StartBreakInput extends PunchContext {
  employeeId: string;
  breakTypeId: string;
}

export interface StartBreakResult {
  /** Den pågående rasten. */
  started: BreakEntry;
  /** Jobben som stängdes av rastrycket. */
  closedJobs: number;
  /** true om rasten redan fanns (omsändning från offline-kön). */
  wasDuplicate: boolean;
}

/** Den pågående rasten för en anställd, eller null. */
export async function getOpenBreak(
  db: CompanyDb,
  employeeId: string
): Promise<BreakEntry | null> {
  return db.breakEntry.findFirst({
    where: { employeeId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

/** Alla pågående raster på företaget. Skärmen visar vilka som är på rast. */
export async function getOpenBreaks(db: CompanyDb): Promise<BreakEntry[]> {
  return db.breakEntry.findMany({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Börjar en rast.
 *
 * Stänger först alla pågående jobb. Ordningen spelar roll: blir skrivningen
 * av rasten avbruten är jobben ändå stängda, och personen står inte kvar
 * instämplad på en order under sin lunch.
 *
 * Är personen redan på rast görs ingenting — ett andra tryck på Lunch är
 * nästan alltid ett dubbeltryck, och att starta om rasten skulle kasta bort
 * den tid som redan gått.
 */
export async function startBreak(
  companyId: string,
  input: StartBreakInput
): Promise<StartBreakResult> {
  const at = input.at ?? new Date();
  const db = forCompany(companyId);

  if (input.clientPunchId) {
    const existing = await db.breakEntry.findFirst({
      where: { clientPunchId: input.clientPunchId },
    });
    if (existing) {
      return { started: existing, closedJobs: 0, wasDuplicate: true };
    }
  }

  const [employee, breakType] = await Promise.all([
    db.employee.findFirst({ where: { id: input.employeeId } }),
    db.breakType.findFirst({ where: { id: input.breakTypeId } }),
  ]);

  if (!employee) throw new ClockError("Okänd anställd.");
  if (!breakType) throw new ClockError("Okänd rast.");
  if (!breakType.active) throw new ClockError("Rasten är inte aktiv.");

  const ongoing = await getOpenBreak(db, input.employeeId);
  if (ongoing) {
    return { started: ongoing, closedJobs: 0, wasDuplicate: true };
  }

  const closed = await clockOutAll(companyId, {
    employeeId: input.employeeId,
    at,
    kioskDeviceId: input.kioskDeviceId,
    sourceIp: input.sourceIp,
    // Egen nyckel: utstämplingen och rasten är två skrivningar av samma tryck,
    // och de får inte dela dubblettnyckel — då skulle en omsändning tro att
    // rasten redan skapats för att jobben hann stängas.
    clientPunchId: input.clientPunchId
      ? `${input.clientPunchId}:jobs`
      : undefined,
  });

  try {
    const started = await db.breakEntry.create({
      data: {
        companyId,
        employeeId: input.employeeId,
        breakTypeId: input.breakTypeId,
        startedAt: at,
        source: input.fromOfflineQueue ? "KIOSK_OFFLINE_SYNC" : "KIOSK",
        clientPunchId: input.clientPunchId ?? null,
        kioskDeviceId: input.kioskDeviceId ?? null,
        sourceIp: input.sourceIp ?? null,
      },
    });

    return { started, closedJobs: closed.length, wasDuplicate: false };
  } catch (error) {
    // Två tryck som kom fram samtidigt. Det andra hittar den första rasten.
    if (isUniqueViolation(error) && input.clientPunchId) {
      const existing = await db.breakEntry.findFirst({
        where: { clientPunchId: input.clientPunchId },
      });
      if (existing) {
        return { started: existing, closedJobs: closed.length, wasDuplicate: true };
      }
    }
    throw error;
  }
}

/**
 * Avslutar den pågående rasten.
 *
 * Görs av sig själv när personen stämplar in på ett jobb igen — se
 * `endOpenBreak` som anropas från `clockIn`. Finns också som eget tryck, för
 * den som kommer tillbaka men inte ska börja på något direkt.
 */
export async function endBreak(
  companyId: string,
  input: PunchContext & { employeeId: string }
): Promise<BreakEntry | null> {
  const at = input.at ?? new Date();
  return endOpenBreak(forCompany(companyId), input.employeeId, at);
}

export { endOpenBreak };

/**
 * Stänger raster som ingen avslutat, vid företagets klockslag.
 *
 * Speglar `autoCloseForgottenEntries` för stämplingar och finns av samma skäl:
 * en rast som står öppen över natten är inte en fyrtontimmarslunch, den är en
 * person som glömde trycka. Posten flaggas för granskning i stället för att
 * tyst få en påhittad längd.
 */
export async function autoCloseForgottenBreaks(
  companyId: string,
  now: Date = new Date()
): Promise<BreakEntry[]> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { autoCloseAt: true, timezone: true },
  });

  if (!company) {
    throw new ClockError(`Hittar inget företag med id "${companyId}".`);
  }

  const db = forCompany(companyId);
  const open = await db.breakEntry.findMany({ where: { endedAt: null } });

  const closed: BreakEntry[] = [];

  for (const entry of open) {
    const deadline = nextOccurrenceOf(
      company.autoCloseAt,
      entry.startedAt,
      company.timezone
    );

    if (now < deadline) continue;

    const { count } = await db.breakEntry.updateMany({
      where: { id: entry.id, endedAt: null },
      data: {
        endedAt: deadline,
        source: "AUTO_CLOSE",
        needsReview: true,
        reviewNote:
          `Rasten avslutades aldrig. Systemet stängde den ${company.autoCloseAt}. ` +
          `Rätta tiden innan tidrapporten lämnas.`,
      },
    });

    if (count === 0) continue;

    const saved = await db.breakEntry.findUnique({ where: { id: entry.id } });
    if (saved) closed.push(saved);
  }

  return closed;
}
