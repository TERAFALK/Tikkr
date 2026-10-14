import type { CompanyDb } from "./tenant";
import { fitsFrom, snap, snapInstant } from "./plan-calendar";
import { addDaysInZone, startOfWeekIn } from "./time-zone";

/**
 * PERSONALPASSEN (tillagt 2026-10-14, fas 2 av issue #21).
 *
 * Enda vägen in till `staff_blocks`. Allt som skriver går härigenom, av samma
 * skäl som `planning.ts` är enda vägen in till stationernas rutor: villkoren
 * nedan kan inte uttryckas i databasen.
 *
 * ── VAD ETT PASS ÄR ──────────────────────────────────────────────────────
 *
 * En anställd planerad på en order och ett arbetsmoment, med start och längd.
 * Det är en AVSIKT, precis som en stationsruta, och gränsen är densamma:
 * planerad tid når aldrig ett fakturaunderlag eller en tidrapport. Filen
 * läser inte `time_entries` alls. Bevisas av tests/planning-boundary.test.ts.
 *
 * Vad passet betyder beror på planeringsläget (planning-modes.ts):
 *
 *   TJÄNST       passen räknar av orderns beräknade tid. De placeras från
 *                Oplacerat, som stationernas rutor gör i en verkstad.
 *   PRODUKTION   passen är BEMANNING. De skapas från en stationsruta och bär
 *                dess id, och räknas inte mot beräkningen — stationen gör det.
 *                Maskinens körtid och operatörens arbetstid skiljer sig: en
 *                CNC kör sex timmar obemannad på en timmes ställtid.
 *
 * ── EN PERSON HAR INGA ARBETSMOMENT ──────────────────────────────────────
 *
 * En station kör ett moment, och en ruta på ett annat avvisas. En person gör
 * det jobbet kräver, och därför prövas inte momentet mot personen.
 *
 * ── DUBBELBOKNING TILLÅTS ────────────────────────────────────────────────
 *
 * Två pass för samma person samtidigt avvisas inte. En operatör kör ibland två
 * maskiner (CLAUDE.md § 3 regel 2), och en plan som vägrar är en plan man
 * slutar använda. Tavlan varnar i gult.
 *
 * ── INGA ARBETSTIDER ÄN ──────────────────────────────────────────────────
 *
 * Personalens arbetstider är fas 3. Till dess räknas ett pass i väggklockans
 * minuter, utan raster att hoppa över, och kapas vid midnatt som en
 * stationsruta. Ingen rast i passet är ett försiktigare fel än en påhittad.
 *
 * ── ETT PASS ÄR EN PERSONUPPGIFT ─────────────────────────────────────────
 *
 * Till skillnad från en stationsruta säger det var en namngiven person ska
 * vara och när. Det raderas vid anonymisering och följer med i
 * registerutdraget, se installningar/actions.ts och person-export.ts.
 */

export interface StaffMember {
  id: string;
  name: string;
  employeeNumber: string | null;
}

export interface StaffBlock {
  id: string;
  employeeId: string;
  employeeName: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  momentId: string;
  momentName: string;
  /** Stationsrutan passet bemannar, och dess station. Null för ett fritt pass. */
  plannedBlockId: string | null;
  stationName: string | null;
  startsAt: Date;
  minutes: number;
  note: string | null;
}

export interface StaffResult {
  error?: string;
  id?: string;
}

/* -------------------------------------------------------------------------- */
/* Läsning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * De anställda som kan planeras: alla aktiva, i bokstavsordning.
 *
 * Avaktiverade tas inte med. En anonymiserad person är avaktiverad, och ska
 * inte stå kvar som en tom rad på tavlan.
 */
export async function staffFor(db: CompanyDb): Promise<StaffMember[]> {
  const rows = await db.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, employeeNumber: true },
  });

  return rows.sort(
    (a, b) =>
      a.name.localeCompare(b.name, "sv") ||
      (a.employeeNumber ?? "").localeCompare(b.employeeNumber ?? "", "sv", {
        numeric: true,
      })
  );
}

const BLOCK_SELECT = {
  id: true,
  employeeId: true,
  orderId: true,
  momentId: true,
  plannedBlockId: true,
  startsAt: true,
  minutes: true,
  note: true,
  employee: { select: { name: true } },
  order: {
    select: { orderNumber: true, customer: { select: { name: true } } },
  },
  moment: { select: { name: true } },
  plannedBlock: { select: { station: { select: { name: true } } } },
} as const;

function toStaffBlock(row: {
  id: string;
  employeeId: string;
  orderId: string;
  momentId: string;
  plannedBlockId: string | null;
  startsAt: Date;
  minutes: number;
  note: string | null;
  employee: { name: string };
  order: { orderNumber: string; customer: { name: string } | null };
  moment: { name: string };
  plannedBlock: { station: { name: string } } | null;
}): StaffBlock {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    customerName: row.order.customer?.name ?? null,
    momentId: row.momentId,
    momentName: row.moment.name,
    plannedBlockId: row.plannedBlockId,
    stationName: row.plannedBlock?.station.name ?? null,
    startsAt: row.startsAt,
    minutes: row.minutes,
    note: row.note,
  };
}

/**
 * Passen i en vecka. Gränserna räknas i företagets tidszon, som för
 * stationernas rutor, se `blocksInWeek` i planning.ts.
 */
export async function staffBlocksInWeek(
  db: CompanyDb,
  monday: Date,
  timeZone: string
): Promise<StaffBlock[]> {
  const from = startOfWeekIn(monday, timeZone);
  const to = addDaysInZone(from, 7, timeZone);

  const rows = await db.staffBlock.findMany({
    where: { startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    select: BLOCK_SELECT,
  });

  return rows.map(toStaffBlock);
}

/**
 * Bemanningen av stationsrutor, per rutans id.
 *
 * Läses för de rutor som syns i veckan, så att stationsvyn kan visa vem som
 * står vid maskinen. Ett pass som bemannar en ruta i veckan men själv ligger i
 * en annan vecka tas med: det hör till rutan, inte till veckan.
 */
export async function staffingOf(
  db: CompanyDb,
  plannedBlockIds: string[]
): Promise<Record<string, StaffBlock[]>> {
  if (plannedBlockIds.length === 0) return {};

  const rows = await db.staffBlock.findMany({
    where: { plannedBlockId: { in: [...new Set(plannedBlockIds)] } },
    orderBy: { startsAt: "asc" },
    select: BLOCK_SELECT,
  });

  const result: Record<string, StaffBlock[]> = {};

  for (const row of rows) {
    if (!row.plannedBlockId) continue;
    (result[row.plannedBlockId] ??= []).push(toStaffBlock(row));
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Skrivning                                                                   */
/* -------------------------------------------------------------------------- */

export interface PlaceStaffBlockInput {
  employeeId: string;
  orderId: string;
  momentId: string;
  /** Stationsrutan passet bemannar. Tomt för ett fritt pass. */
  plannedBlockId?: string | null;
  startsAt: Date;
  minutes: number;
  note?: string | null;
  byEmail: string;
}

/**
 * Lägger ett pass.
 *
 * Villkoren, och inget av dem kan uttryckas i databasen:
 *
 *  1. ALLT SLÅS UPP GENOM FÖRETAGSKLIENTEN FÖRST. Id:na kommer från ett
 *     formulär, och filtreringslagret kan inte veta vad de utpekade raderna
 *     tillhör. Samma kontroll som `placeBlock` gör.
 *  2. PERSONEN ÄR AKTIV. En avaktiverad person finns inte på tavlan, och ett
 *     pass för hen vore osynligt.
 *  3. ORDERN ÄR ÖPPEN. Ett avslutat jobb tar inte emot ny tid, varken
 *     stämplad eller planerad.
 *  4. EN BEMANNING HÖR TILL SIN RUTA. Rutan finns i företaget och gäller samma
 *     order och moment. Annars kunde ett pass påstå att det bemannar en
 *     fräsning medan det själv var planerat på en svetsning.
 *  5. PASSET LIGGER INOM ETT DYGN. Det kapas vid midnatt, som en stationsruta.
 */
export async function placeStaffBlock(
  db: CompanyDb,
  companyId: string,
  timeZone: string,
  input: PlaceStaffBlockInput
): Promise<StaffResult> {
  const [employee, order, moment, planned] = await Promise.all([
    db.employee.findFirst({
      where: { id: input.employeeId },
      select: { id: true, active: true },
    }),
    db.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, status: true },
    }),
    db.workMoment.findFirst({
      where: { id: input.momentId },
      select: { id: true },
    }),
    input.plannedBlockId
      ? db.plannedBlock.findFirst({
          where: { id: input.plannedBlockId },
          select: { id: true, orderId: true, momentId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!employee) return { error: "Den anställda finns inte." };
  if (!employee.active) return { error: "Den anställda är avaktiverad." };
  if (!order) return { error: "Ordern finns inte." };
  if (!moment) return { error: "Arbetsmomentet finns inte." };

  if (order.status === "CLOSED") {
    return { error: "Ordern är avslutad och tar inte emot planerad tid." };
  }

  if (input.plannedBlockId) {
    if (!planned) return { error: "Rutan finns inte." };

    if (planned.orderId !== order.id || planned.momentId !== moment.id) {
      return { error: "Passet gäller ett annat jobb än rutan." };
    }
  }

  const startsAt = snapInstant(input.startsAt, timeZone);
  const room = fitsFrom(null, startsAt, timeZone);

  if (room < 1) return { error: "Starttiden ligger för sent på dygnet." };

  const minutes = Math.min(snap(input.minutes), room);

  const created = await db.staffBlock.create({
    data: {
      companyId,
      employeeId: employee.id,
      orderId: order.id,
      momentId: moment.id,
      plannedBlockId: planned?.id ?? null,
      startsAt,
      minutes,
      note: input.note?.trim() || null,
      createdByEmail: input.byEmail,
    },
    select: { id: true },
  });

  return { id: created.id };
}

/**
 * Flyttar ett pass, till en annan tid eller en annan person.
 *
 * KOPPLINGEN TILL RUTAN STÅR KVAR. Ställtiden före en körning är fortfarande
 * bemanning av körningen, och den som flyttar passet en timme tidigare har
 * inte menat att lösgöra det. Ska passet bli fritt tas det bort och läggs om.
 */
export async function moveStaffBlock(
  db: CompanyDb,
  timeZone: string,
  blockId: string,
  employeeId: string,
  startsAt: Date
): Promise<StaffResult> {
  const [block, employee] = await Promise.all([
    db.staffBlock.findFirst({
      where: { id: blockId },
      select: { id: true, minutes: true },
    }),
    db.employee.findFirst({
      where: { id: employeeId },
      select: { id: true, active: true },
    }),
  ]);

  if (!block) return { error: "Passet finns inte." };
  if (!employee) return { error: "Den anställda finns inte." };
  if (!employee.active) return { error: "Den anställda är avaktiverad." };

  const snapped = snapInstant(startsAt, timeZone);
  const room = fitsFrom(null, snapped, timeZone);

  if (room < 1) return { error: "Starttiden ligger för sent på dygnet." };

  await db.staffBlock.updateMany({
    where: { id: blockId },
    data: {
      employeeId: employee.id,
      startsAt: snapped,
      minutes: Math.min(block.minutes, room),
    },
  });

  return { id: blockId };
}

/** Ändrar ett pass längd, kapad vid midnatt. */
export async function resizeStaffBlock(
  db: CompanyDb,
  timeZone: string,
  blockId: string,
  minutes: number
): Promise<StaffResult> {
  const block = await db.staffBlock.findFirst({
    where: { id: blockId },
    select: { id: true, startsAt: true },
  });

  if (!block) return { error: "Passet finns inte." };

  const room = fitsFrom(null, block.startsAt, timeZone);

  await db.staffBlock.updateMany({
    where: { id: blockId },
    data: { minutes: Math.min(snap(minutes), Math.max(room, 1)) },
  });

  return { id: blockId };
}

/** Skriver om ett pass anteckning. */
export async function noteStaffBlock(
  db: CompanyDb,
  blockId: string,
  note: string
): Promise<StaffResult> {
  await db.staffBlock.updateMany({
    where: { id: blockId },
    data: { note: note.trim() || null },
  });

  return { id: blockId };
}

/**
 * Tar bort ett pass. En avsikt man ändrat sig om ska försvinna, samma skäl
 * som `removeBlock`. I läget Tjänst kommer tiden tillbaka till Oplacerat av
 * sig själv, eftersom den oplacerade tiden härleds.
 */
export async function removeStaffBlock(
  db: CompanyDb,
  blockId: string
): Promise<StaffResult> {
  await db.staffBlock.deleteMany({ where: { id: blockId } });
  return {};
}
