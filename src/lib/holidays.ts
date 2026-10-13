import type { CompanyDb } from "./tenant";
import { recordAudit } from "./audit";
import { dayNumberIn } from "./time-zone";

/**
 * RÖDA DAGAR — KUNDENS EGEN LISTA (tillagt 2026-10-13).
 *
 * En röd dag har ingen planerad tid, för någon i arbetsytan. Räkningen sker i
 * payroll.ts; här ligger bara listan och vägarna in i den.
 *
 * Kundens egen lista och inte en uträknad kalender, kundens val. Vilka aftnar
 * och klämdagar som är lediga skiljer sig mellan verkstäder, och en lista
 * kunden skrivit själv säger exakt det som gäller hos dem. Priset är att
 * listan måste fyllas i varje år, och en glömd dag ger minus i flexen för
 * alla som var lediga.
 *
 * Ändringar loggas: en röd dag flyttar planerad tid, och därmed flexen, för
 * varje anställd på en gång.
 */

export class HolidayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HolidayError";
  }
}

/**
 * Lägger in en röd dag, eller byter namn på en som redan finns samma dag.
 *
 * Samma dag två gånger är en rättelse av namnet, inte en dag till. Samma
 * hållning som frånvaron, se markAbsence.
 */
export async function addHoliday(
  db: CompanyDb,
  companyId: string,
  input: { date: Date; name: string; byEmail: string }
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new HolidayError("Ange ett namn, till exempel Juldagen.");

  const existing = await db.holiday.findFirst({ where: { date: input.date } });

  const holiday = await db.holiday.upsert({
    where: { companyId_date: { companyId, date: input.date } },
    create: { companyId, date: input.date, name, createdByEmail: input.byEmail },
    update: { name },
  });

  await recordAudit(db, {
    companyId,
    actorEmail: input.byEmail,
    entity: "Holiday",
    entityId: holiday.id,
    action: existing ? "update" : "create",
    before: existing ? holidaySnapshot(existing) : null,
    after: holidaySnapshot(holiday),
  });
}

/** Tar bort en röd dag. Ett id från en annan kund hittar ingenting. */
export async function removeHoliday(
  db: CompanyDb,
  id: string,
  byEmail: string
): Promise<void> {
  const holiday = await db.holiday.findFirst({ where: { id } });
  if (!holiday) return;

  await db.holiday.deleteMany({ where: { id } });

  await recordAudit(db, {
    companyId: db.$companyId,
    actorEmail: byEmail,
    entity: "Holiday",
    entityId: id,
    action: "delete",
    before: holidaySnapshot(holiday),
  });
}

/**
 * De röda dagarna i ett intervall, nyckel = dagens nummer på väggen (se
 * dayNumberIn), värde = namnet. Samma nyckel som payroll.ts sorterar allt
 * annat på, så att en röd dag hamnar på samma dag som stämplingarna.
 */
export async function holidaysBetween(
  db: CompanyDb,
  from: Date,
  toExclusive: Date,
  timeZone: string
): Promise<Map<number, string>> {
  const rows = await db.holiday.findMany({
    where: { date: { gte: from, lt: toExclusive } },
    select: { date: true, name: true },
  });

  return new Map(rows.map((row) => [dayNumberIn(row.date, timeZone), row.name]));
}

function holidaySnapshot(holiday: { date: Date; name: string }): Record<string, unknown> {
  return { date: holiday.date.toISOString(), name: holiday.name };
}
