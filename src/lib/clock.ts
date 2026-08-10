import { Prisma, type TimeEntry } from "@prisma/client";
import { unsafeGlobalPrisma } from "./db";
import { forCompany, type CompanyDb } from "./tenant";
import { nextOccurrenceOf } from "./time-zone";

/**
 * STÄMPLINGSLOGIKEN.
 *
 * Reglerna som avgör om kundens fakturaunderlag stämmer. Allt här är avsiktligt
 * fritt från webb och skärm — det är ren logik som går att testa i detalj.
 *
 * Grundregel: en anställd kan ha HÖGST EN öppen stämpling åt gången. Stämplar
 * någon in på ett nytt jobb stängs det förra automatiskt, i samma ögonblick.
 * Ingen tid får räknas på två ordrar samtidigt — det skulle fakturera samma
 * timme till två kunder.
 */

export class ClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockError";
  }
}

export interface PunchContext {
  /** Vilken fysisk skärm trycket kom ifrån. Sparas för audit-loggen. */
  kioskDeviceId?: string;
  sourceIp?: string;
  /**
   * När trycket faktiskt skedde. Utelämnas normalt (då gäller "nu"), men
   * sätts av offline-kön: en stämpling som gjorts kl 07:00 utan nät ska
   * registreras på 07:00, inte på klockslaget då nätet kom tillbaka.
   */
  at?: Date;
  /**
   * Skärmens eget id för trycket. Skickas en stämpling om flera gånger
   * — vilket offline-kön gör om kvittensen tappas — känns den igen på det här
   * och registreras bara en gång.
   */
  clientPunchId?: string;
  /** true när stämplingen kommer från offline-kön. Syns i audit-loggen. */
  fromOfflineQueue?: boolean;
}

export interface ClockInInput extends PunchContext {
  employeeId: string;
  orderId: string;
  momentId: string;
}

export interface ClockInResult {
  /** Den nya, pågående stämplingen. */
  started: TimeEntry;
  /** Det föregående jobbet som stängdes automatiskt, om det fanns något. */
  autoClosed: TimeEntry | null;
  /** true om stämplingen redan fanns sedan tidigare (omsändning från kön). */
  wasDuplicate: boolean;
}

/** Hämtar den pågående stämplingen för en anställd, eller null. */
export async function getOpenEntry(
  db: CompanyDb,
  employeeId: string
): Promise<TimeEntry | null> {
  return db.timeEntry.findFirst({
    where: { employeeId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
}

/**
 * Stämplar in på ett jobb. Stänger automatiskt ett pågående jobb först.
 *
 * Allt sker i en transaktion: antingen stängs det gamla OCH öppnas det nya,
 * eller så händer ingenting. Utan det skulle ett avbrott mitt i kunna lämna
 * någon utan öppen stämpling, eller med två.
 */
export async function clockIn(
  companyId: string,
  input: ClockInInput
): Promise<ClockInResult> {
  const at = input.at ?? new Date();
  const db = forCompany(companyId);

  if (input.clientPunchId) {
    const existing = await db.timeEntry.findFirst({
      where: { clientPunchId: input.clientPunchId },
    });
    if (existing) {
      // Skärmen skickade om en stämpling den redan fått registrerad.
      return { started: existing, autoClosed: null, wasDuplicate: true };
    }
  }

  await assertBelongsToCompany(db, input);

  return db.$transaction(async (tx) => {
    const open = await tx.timeEntry.findFirst({
      where: { employeeId: input.employeeId, clockOutAt: null },
      orderBy: { clockInAt: "desc" },
    });

    let autoClosed: TimeEntry | null = null;

    if (open) {
      if (open.clockInAt > at) {
        // Kan hända när offline-kön levererar tryck i fel ordning.
        throw new ClockError(
          "Stämplingen ligger före den pågående stämplingens starttid. " +
            "Registrera den i rätt ordning, eller låt admin rätta posten."
        );
      }

      // `source` rörs inte: den beskriver hur posten SKAPADES, inte hur den
      // stängdes. Här stängdes den av att den anställde själv började ett nytt
      // jobb — en helt normal utstämpling som admin inte behöver titta på.
      autoClosed = await tx.timeEntry.update({
        where: { id: open.id },
        data: { clockOutAt: at },
      });
    }

    const started = await tx.timeEntry.create({
      data: {
        // companyId anges uttryckligen eftersom Prismas typer kräver det.
        // Filtreringslagret kontrollerar att det stämmer med klienten och
        // vägrar annars — se src/lib/tenant.ts.
        companyId,
        employeeId: input.employeeId,
        orderId: input.orderId,
        momentId: input.momentId,
        clockInAt: at,
        source: input.fromOfflineQueue ? "KIOSK_OFFLINE_SYNC" : "KIOSK",
        kioskDeviceId: input.kioskDeviceId ?? null,
        sourceIp: input.sourceIp ?? null,
        clientPunchId: input.clientPunchId ?? null,
      },
    });

    return { started, autoClosed, wasDuplicate: false };
  });
}

/**
 * Stämplar ut från pågående jobb.
 *
 * Finns ingen öppen stämpling händer ingenting och `null` returneras. Det är
 * med flit: trycker någon "stämpla ut" två gånger ska det inte bli ett fel på
 * skärmen, bara ingen ytterligare effekt.
 */
export async function clockOut(
  companyId: string,
  input: PunchContext & { employeeId: string }
): Promise<TimeEntry | null> {
  const at = input.at ?? new Date();
  const db = forCompany(companyId);

  if (input.clientPunchId) {
    const existing = await db.timeEntry.findFirst({
      where: { clientPunchId: input.clientPunchId },
    });
    if (existing) return existing;
  }

  const open = await getOpenEntry(db, input.employeeId);
  if (!open) return null;

  if (open.clockInAt > at) {
    throw new ClockError(
      "Utstämplingen ligger före instämplingen. Låt admin rätta posten."
    );
  }

  return db.timeEntry.update({
    where: { id: open.id },
    data: { clockOutAt: at },
  });
}

/**
 * Stänger stämplingar som ingen stämplat ut från.
 *
 * Körs återkommande (t.ex. varje kvart). För varje öppen stämpling räknas ut
 * när företagets klockslag nästa gång inföll efter instämplingen — har den
 * tidpunkten passerat stängs posten där.
 *
 * Posten flaggas ALLTID för granskning. Systemet vet inte när personen
 * verkligen slutade; det gissar för att fakturaunderlaget ska bli användbart,
 * och talar om att det gissat.
 */
export async function autoCloseForgottenEntries(
  companyId: string,
  now: Date = new Date()
): Promise<TimeEntry[]> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { autoCloseAt: true, timezone: true },
  });

  if (!company) {
    throw new ClockError(`Hittar inget företag med id "${companyId}".`);
  }

  const db = forCompany(companyId);
  const open = await db.timeEntry.findMany({ where: { clockOutAt: null } });

  const closed: TimeEntry[] = [];

  for (const entry of open) {
    const deadline = nextOccurrenceOf(
      company.autoCloseAt,
      entry.clockInAt,
      company.timezone
    );

    if (now < deadline) continue;

    closed.push(
      await db.timeEntry.update({
        where: { id: entry.id },
        data: {
          clockOutAt: deadline,
          source: "AUTO_CLOSE",
          needsReview: true,
          reviewNote:
            `Automatiskt utstämplad ${company.autoCloseAt} — ingen utstämpling ` +
            `registrerades. Kontrollera tiden innan fakturering.`,
        },
      })
    );
  }

  return closed;
}

/**
 * Kontrollerar att anställd, order och moment finns hos företaget och går att
 * stämpla på. Utan detta skulle ett trasigt eller manipulerat anrop kunna
 * skapa en stämpling som pekar på ingenting.
 */
async function assertBelongsToCompany(db: CompanyDb, input: ClockInInput) {
  const [employee, order, moment] = await Promise.all([
    db.employee.findFirst({ where: { id: input.employeeId } }),
    db.order.findFirst({ where: { id: input.orderId } }),
    db.workMoment.findFirst({ where: { id: input.momentId } }),
  ]);

  if (!employee) throw new ClockError("Okänd anställd.");
  if (!employee.active) throw new ClockError("Den anställde är inte aktiv.");
  if (!order) throw new ClockError("Okänd order.");
  if (order.status === "CLOSED") throw new ClockError("Ordern är stängd.");
  if (!moment) throw new ClockError("Okänt arbetsmoment.");
  if (!moment.active) throw new ClockError("Arbetsmomentet är inte aktivt.");
}

/** Prismas felkod för brott mot en unik-regel. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}
