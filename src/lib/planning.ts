import type { CompanyDb } from "./tenant";
import {
  fitsFrom,
  snap,
  snapInstant,
  type StationHours,
} from "./plan-calendar";
import { isoWeekdayIn, type WeekdayHours } from "./weekly-hours";
import { addDaysInZone, startOfDayIn, startOfWeekIn } from "./time-zone";

/**
 * PLANERINGEN — STATIONER OCH PLANERADE RUTOR.
 *
 * Enda vägen in till `stations`, `station_days`, `station_breaks` och
 * `planned_blocks`. Allt som skriver går härigenom, av samma skäl som
 * `clock.ts` är enda vägen in till stämplingarna: villkoren nedan kan inte
 * uttryckas i databasen, och ett villkor som vaktas på två ställen vaktas snart
 * på inget.
 *
 * ── VAD MODULEN SVARAR PÅ ────────────────────────────────────────────────
 *
 * Verkstaden vet vad en order är BERÄKNAD att ta per arbetsmoment
 * (`order_budgets`), och i efterhand vad den FAKTISKT tog (stämplingarna). Det
 * som saknas är steget mellan: när ska jobbet köras, och på vilken maskin.
 *
 * ── GRÄNSEN, SOM INTE FÅR SUDDAS ─────────────────────────────────────────
 *
 * PLANERAD TID ÄR VARKEN ARBETAD ELLER FAKTURERBAR TID. Den är en avsikt. Den
 * når aldrig ett fakturaunderlag, en efterkalkyl, en rapport eller en
 * tidrapport. Började fakturasidan läsa planen vore det en tidsfråga innan
 * någon fakturerade en order på vad den var TÄNKT att ta, och kunden skulle
 * betala för arbete som inte utförts.
 *
 * Filen läser `time_entries` INTE alls. Utfallet mot planen räknas i
 * `plan-live.ts`, som bara läser. Bevisas av
 * `tests/planning-boundary.test.ts`.
 *
 * Importerar heller ingen lönefil. Modulerna säljs var för sig, och en kund kan
 * ha den ena utan den andra — stationernas öppettider ligger därför i egna
 * tabeller och inte i `work_schedules`. Formulärdelen de ändå delar bor i
 * `weekly-hours.ts`, som är neutral.
 *
 * ── INGEN TID FÅR FALLA BORT ─────────────────────────────────────────────
 *
 * Det är modulens enda hårda krav mot användaren. Summan av en orders
 * planerade rutor plus dess oplacerade tid är ALLTID den beräknade tiden.
 * Därför lagras den oplacerade tiden ingenstans — den härleds, varje gång, i
 * `unplacedWork`. Ett cachat tal och en uppsättning rutor är två ställen som
 * säger samma sak, och de hinner alltid sluta göra det.
 */

/** Standardtider en ny station får i formuläret: mån–fre 07:00–16:00. */
export const DEFAULT_STATION_HOURS: WeekdayHours[] = [1, 2, 3, 4, 5].map(
  (weekday) => ({
    weekday,
    startMinute: 7 * 60,
    endMinute: 16 * 60,
    breaks: [{ startMinute: 12 * 60, endMinute: 12 * 60 + 30 }],
  })
);

export interface Station {
  id: string;
  name: string;
  momentId: string;
  momentName: string;
  active: boolean;
  sortOrder: number;
  /** Öppettiderna, en post per veckodag som stationen går. */
  hours: StationHours[];
  /** Antal planerade rutor från idag och framåt. Styr om den går att stänga. */
  upcomingBlocks: number;
}

export interface PlannedBlock {
  id: string;
  stationId: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  momentId: string;
  momentName: string;
  startsAt: Date;
  minutes: number;
  note: string | null;
}

/**
 * En rad i Oplacerat: beräknad tid per order och moment, minus det som ligger
 * ute på tavlan.
 *
 * `budgetMinutes` är null när någon planerat ett moment ordern inte har någon
 * beräkning för. Det är tillåtet — kontoret hinner inte alltid räkna innan
 * jobbet måste in i veckan — och raden visas då med sin planerade tid och utan
 * återstod.
 */
export interface UnplacedRow {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  dueDate: Date | null;
  momentId: string;
  momentName: string;
  budgetMinutes: number | null;
  placedMinutes: number;
  /** Beräknat minus placerat. Negativt betyder planerat över beräkningen. */
  remainingMinutes: number;
  /** false när ingen aktiv station kan göra momentet. */
  plannable: boolean;
}

/* -------------------------------------------------------------------------- */
/* Läsning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Stationerna med sina öppettider.
 *
 * Avaktiverade tas med: de ska gå att se och slå på igen i registret. Tavlan
 * filtrerar bort dem själv.
 */
export async function stationsFor(
  db: CompanyDb,
  timeZone: string
): Promise<Station[]> {
  // Dygnets början på väggen, inte serverns. Containern kör UTC, och en ruta
  // tidigt i morse hade annars räknats som passerad.
  const today = startOfDayIn(new Date(), timeZone);

  // Kommande rutor räknas i en EGEN fråga och inte som ett filtrerat
  // relationsantal inuti select. Ett `_count` med `where` är en nyare
  // Prisma-finess, och en läsning som är central för hela modulen ska inte
  // bero på vilken version servern råkar ha.
  const [rows, upcoming] = await Promise.all([
    db.station.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        momentId: true,
        active: true,
        sortOrder: true,
        moment: { select: { name: true } },
        days: {
          orderBy: { weekday: "asc" },
          select: {
            weekday: true,
            startMinute: true,
            endMinute: true,
            breaks: {
              orderBy: { startMinute: "asc" },
              select: { startMinute: true, endMinute: true },
            },
          },
        },
      },
    }),
    db.plannedBlock.groupBy({
      by: ["stationId"],
      where: { startsAt: { gte: today } },
      _count: { _all: true },
    }),
  ]);

  const counted = new Map(
    upcoming.map((row) => [row.stationId, row._count._all])
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    momentId: row.momentId,
    momentName: row.moment.name,
    active: row.active,
    sortOrder: row.sortOrder,
    hours: row.days,
    upcomingBlocks: counted.get(row.id) ?? 0,
  }));
}

/** Stationens tider den veckodag en tidpunkt faller på, eller null när stängt. */
export function hoursOn(
  station: { hours: StationHours[] },
  instant: Date,
  timeZone: string
): StationHours | null {
  const weekday = isoWeekdayIn(instant, timeZone);
  return station.hours.find((day) => day.weekday === weekday) ?? null;
}

/**
 * Rutorna i en vecka.
 *
 * Veckan börjar på måndag, som överallt annars i systemet — det är den svenska
 * konventionen och den verkstäder planerar efter.
 *
 * Gränserna räknas i FÖRETAGETS tidszon. Räknade vi dem i serverns skulle en
 * ruta sent på söndagen hamna i nästa vecka, och planeraren leta efter den i
 * en timme.
 */
export async function blocksInWeek(
  db: CompanyDb,
  monday: Date,
  timeZone: string
): Promise<PlannedBlock[]> {
  const from = startOfWeekIn(monday, timeZone);

  // Nästa måndags början, inte "sju dygn senare". Veckan med sommartidens slut
  // är 169 timmar lång, och den timmen hör till veckan.
  const to = addDaysInZone(from, 7, timeZone);

  const rows = await db.plannedBlock.findMany({
    where: { startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      stationId: true,
      orderId: true,
      momentId: true,
      startsAt: true,
      minutes: true,
      note: true,
      order: {
        select: { orderNumber: true, customer: { select: { name: true } } },
      },
      moment: { select: { name: true } },
    },
  });

  return rows.map(toPlannedBlock);
}

function toPlannedBlock(row: {
  id: string;
  stationId: string;
  orderId: string;
  momentId: string;
  startsAt: Date;
  minutes: number;
  note: string | null;
  order: { orderNumber: string; customer: { name: string } | null };
  moment: { name: string };
}): PlannedBlock {
  return {
    id: row.id,
    stationId: row.stationId,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    customerName: row.order.customer?.name ?? null,
    momentId: row.momentId,
    momentName: row.moment.name,
    startsAt: row.startsAt,
    minutes: row.minutes,
    note: row.note,
  };
}

/**
 * Tiden som ännu inte ligger på tavlan.
 *
 * Räknar varje öppen orders beräknade rader minus de rutor som redan är
 * placerade — ALLA rutor, inte bara den visade veckans. En ruta som ligger i
 * nästa månad är placerad, och tiden får inte kunna placeras två gånger.
 *
 * LAGRAS INGENSTANS. Se toppkommentaren: summan av planerat och återstående
 * ska alltid vara den beräknade tiden, och det villkoret håller bara om ena
 * ledet härleds ur det andra.
 *
 * Stängda ordrar tas inte med. Är jobbet klart finns ingenting kvar att
 * planera, och raden skulle bara skymma det som är ogjort.
 */
export async function unplacedWork(db: CompanyDb): Promise<UnplacedRow[]> {
  const [orders, blocks, stations] = await Promise.all([
    db.order.findMany({
      where: { status: "OPEN" },
      select: {
        id: true,
        orderNumber: true,
        plannedDueDate: true,
        customer: { select: { name: true } },
        budgets: {
          select: {
            momentId: true,
            minutes: true,
            moment: { select: { name: true } },
          },
        },
      },
    }),
    db.plannedBlock.findMany({
      select: {
        orderId: true,
        momentId: true,
        minutes: true,
        moment: { select: { name: true } },
      },
    }),
    db.station.findMany({
      where: { active: true },
      select: { momentId: true },
    }),
  ]);

  const canDo = new Set(stations.map((station) => station.momentId));

  /** Placerade minuter per order och moment. */
  const placed = new Map<string, number>();
  /** Vilka moment som har rutor, per order, med momentets namn. */
  const plannedPerOrder = new Map<string, Map<string, string>>();

  for (const block of blocks) {
    const key = `${block.orderId}:${block.momentId}`;
    placed.set(key, (placed.get(key) ?? 0) + block.minutes);

    const perOrder = plannedPerOrder.get(block.orderId) ?? new Map();
    perOrder.set(block.momentId, block.moment.name);
    plannedPerOrder.set(block.orderId, perOrder);
  }

  const rows: UnplacedRow[] = [];

  for (const order of orders) {
    const seen = new Set<string>();

    for (const budget of order.budgets) {
      const key = `${order.id}:${budget.momentId}`;
      seen.add(budget.momentId);

      const placedMinutes = placed.get(key) ?? 0;

      rows.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name ?? null,
        dueDate: order.plannedDueDate,
        momentId: budget.momentId,
        momentName: budget.moment.name,
        budgetMinutes: budget.minutes,
        placedMinutes,
        remainingMinutes: budget.minutes - placedMinutes,
        plannable: canDo.has(budget.momentId),
      });
    }

    // Rutor på moment ordern inte har någon beräkning för. Tillåtet, och
    // raden visas så att tiden inte är osynlig — men utan återstod, eftersom
    // det inte finns någon beräkning att räkna ned.
    for (const [momentId, name] of plannedPerOrder.get(order.id) ?? []) {
      if (seen.has(momentId)) continue;

      rows.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name ?? null,
        dueDate: order.plannedDueDate,
        momentId,
        momentName: name,
        budgetMinutes: null,
        placedMinutes: placed.get(`${order.id}:${momentId}`) ?? 0,
        remainingMinutes: 0,
        plannable: canDo.has(momentId),
      });
    }
  }

  return rows.sort(byUrgency);
}

/**
 * Ordningen i Oplacerat: leveransdatum först, sedan ordernummer.
 *
 * Ordrar utan datum hamnar sist. Att de skulle hamna först vore fel håll —
 * tomt betyder "ingen har sagt när", inte "genast".
 */
function byUrgency(a: UnplacedRow, b: UnplacedRow): number {
  const left = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;

  if (left !== right) return left - right;

  const order = a.orderNumber.localeCompare(b.orderNumber, "sv", {
    numeric: true,
  });
  if (order !== 0) return order;

  return a.momentName.localeCompare(b.momentName, "sv");
}

/* -------------------------------------------------------------------------- */
/* Skrivning                                                                   */
/* -------------------------------------------------------------------------- */

/** Svaret varje skrivande funktion ger. Ett fel att visa, eller ingenting. */
export interface PlanResult {
  error?: string;
  id?: string;
}

/** Stationen som den behövs för att räkna, med sina dagar. */
async function loadStation(db: CompanyDb, stationId: string) {
  return db.station.findFirst({
    where: { id: stationId },
    select: {
      id: true,
      momentId: true,
      active: true,
      days: {
        select: {
          weekday: true,
          startMinute: true,
          endMinute: true,
          breaks: { select: { startMinute: true, endMinute: true } },
        },
      },
    },
  });
}

export interface PlaceBlockInput {
  orderId: string;
  momentId: string;
  stationId: string;
  startsAt: Date;
  minutes: number;
  note?: string | null;
  byEmail: string;
}

/**
 * Lägger en ruta på tavlan.
 *
 * Fyra villkor vaktas här, och inget av dem kan uttryckas i databasen:
 *
 *  1. STATIONEN GÖR MOMENTET. En station kör ett arbetsmoment, och en ruta på
 *     ett annat vore en plan som inte går att utföra.
 *  2. ORDERN ÄR ÖPPEN. Samma hållning som clock.ts har: ett avslutat jobb tar
 *     inte emot ny tid, varken stämplad eller planerad.
 *  3. ALLT SLÅS UPP GENOM FÖRETAGSKLIENTEN FÖRST. Id:na kommer från ett
 *     formulär. Filtreringslagret stämplar företaget på raden men kan inte veta
 *     vad de utpekade raderna tillhör — den kontrollen måste göras här, precis
 *     som `saveOrderBudgets` gör den.
 *  4. RUTAN LIGGER INOM ETT DYGN. Dras den mot midnatt kapas den där, och
 *     återstoden ligger kvar som oplacerad.
 *
 * Överlappande rutor och tid utanför öppettiderna avvisas INTE. Överbokning är
 * tillåten och varnas bara för: administratören vet ibland att maskinen ska gå
 * över kvällen, och en plan som vägrar är en plan man slutar använda.
 */
export async function placeBlock(
  db: CompanyDb,
  companyId: string,
  timeZone: string,
  input: PlaceBlockInput
): Promise<PlanResult> {
  const [station, order, moment] = await Promise.all([
    loadStation(db, input.stationId),
    db.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, status: true },
    }),
    db.workMoment.findFirst({
      where: { id: input.momentId },
      select: { id: true },
    }),
  ]);

  if (!station) return { error: "Stationen finns inte." };
  if (!station.active) return { error: "Stationen är avstängd." };
  if (!order) return { error: "Ordern finns inte." };
  if (!moment) return { error: "Arbetsmomentet finns inte." };

  if (order.status === "CLOSED") {
    return { error: "Ordern är avslutad och tar inte emot planerad tid." };
  }

  if (station.momentId !== input.momentId) {
    return { error: "Stationen kör ett annat arbetsmoment." };
  }

  const startsAt = snapInstant(input.startsAt, timeZone);
  const hours = hoursOn(station, startsAt, timeZone);
  const room = fitsFrom(hours, startsAt, timeZone);

  if (room < 1) {
    return { error: "Starttiden ligger för sent på dygnet." };
  }

  const minutes = Math.min(snap(input.minutes), room);

  const created = await db.plannedBlock.create({
    data: {
      companyId,
      stationId: station.id,
      orderId: order.id,
      momentId: input.momentId,
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
 * Flyttar en ruta, inom eller mellan stationer.
 *
 * MOMENTET FÖLJER MED OFÖRÄNDRAT, och målstationen måste köra just det. En
 * flytt som bytte moment vore ingen flytt: rutan skulle börja räkna av en
 * annan beräkningsrad, och orderns planerade tid hoppa på två ställen
 * samtidigt.
 *
 * Minuterna kapas mot det nya dygnet. Flyttas en ruta sent på kvällen krymper
 * den, och återstoden hamnar i Oplacerat av sig själv — ingenting faller bort.
 */
export async function moveBlock(
  db: CompanyDb,
  timeZone: string,
  blockId: string,
  stationId: string,
  startsAt: Date
): Promise<PlanResult> {
  const block = await db.plannedBlock.findFirst({
    where: { id: blockId },
    select: { id: true, momentId: true, minutes: true },
  });

  if (!block) return { error: "Rutan finns inte." };

  const station = await loadStation(db, stationId);

  if (!station) return { error: "Stationen finns inte." };
  if (!station.active) return { error: "Stationen är avstängd." };

  if (station.momentId !== block.momentId) {
    return { error: "Stationen kör ett annat arbetsmoment." };
  }

  const snapped = snapInstant(startsAt, timeZone);
  const hours = hoursOn(station, snapped, timeZone);
  const room = fitsFrom(hours, snapped, timeZone);

  if (room < 1) {
    return { error: "Starttiden ligger för sent på dygnet." };
  }

  await db.plannedBlock.updateMany({
    where: { id: blockId },
    data: {
      stationId: station.id,
      startsAt: snapped,
      minutes: Math.min(block.minutes, room),
    },
  });

  return { id: blockId };
}

/**
 * Ändrar en rutas längd.
 *
 * Krymper man rutan går minuterna tillbaka till Oplacerat av sig själva,
 * eftersom återstoden härleds och inte lagras. Det är hela skälet att den inte
 * lagras.
 */
export async function resizeBlock(
  db: CompanyDb,
  timeZone: string,
  blockId: string,
  minutes: number
): Promise<PlanResult> {
  const block = await db.plannedBlock.findFirst({
    where: { id: blockId },
    select: { id: true, stationId: true, startsAt: true },
  });

  if (!block) return { error: "Rutan finns inte." };

  const station = await loadStation(db, block.stationId);
  if (!station) return { error: "Stationen finns inte." };

  const hours = hoursOn(station, block.startsAt, timeZone);
  const room = fitsFrom(hours, block.startsAt, timeZone);

  await db.plannedBlock.updateMany({
    where: { id: blockId },
    data: { minutes: Math.min(snap(minutes), Math.max(room, 1)) },
  });

  return { id: blockId };
}

/** Skriver om en rutas anteckning. */
export async function noteBlock(
  db: CompanyDb,
  blockId: string,
  note: string
): Promise<PlanResult> {
  await db.plannedBlock.updateMany({
    where: { id: blockId },
    data: { note: note.trim() || null },
  });

  return { id: blockId };
}

/**
 * Tar bort en ruta från tavlan.
 *
 * Till skillnad från en stämpling GÅR en ruta att radera. En stämpling är en
 * uppgift om vad som hänt och rättas genom att skrivas om (CLAUDE.md § 3.2); en
 * planerad ruta är en avsikt, och en avsikt man ändrat sig om ska försvinna.
 * Tiden går inte förlorad — den ligger kvar i orderns beräkning och dyker upp i
 * Oplacerat igen.
 */
export async function removeBlock(
  db: CompanyDb,
  blockId: string
): Promise<PlanResult> {
  await db.plannedBlock.deleteMany({ where: { id: blockId } });
  return {};
}

/* --- Stationsregistret ---------------------------------------------------- */

export interface SaveStationInput {
  /** Tomt vid ny station. */
  stationId?: string | null;
  name: string;
  momentId: string;
  days: WeekdayHours[];
}

/**
 * Lägger upp eller ändrar en station.
 *
 * ARBETSMOMENTET GÅR INTE ATT BYTA när rutor finns. Varje ruta skulle annars
 * tyst börja peka på en annan beräkningsrad: en order som hade fyra timmars
 * fräsning planerad skulle plötsligt ha fyra timmars svarvning, utan att någon
 * ändrat ordern. Rätt väg är att stänga stationen och lägga upp en ny, och
 * felmeddelandet säger det.
 *
 * Dagarna skrivs om från grunden, av samma skäl som schemats dagar gör det: en
 * omskrivning kan inte lämna kvar en dag som tagits bort i rutan.
 */
export async function saveStation(
  db: CompanyDb,
  companyId: string,
  input: SaveStationInput
): Promise<PlanResult> {
  const name = input.name.trim();
  if (!name) return { error: "Ange ett namn." };

  const moment = await db.workMoment.findFirst({
    where: { id: input.momentId },
    select: { id: true, active: true },
  });

  if (!moment) return { error: "Välj ett arbetsmoment." };

  if (!moment.active && !input.stationId) {
    // En ny station på ett avaktiverat moment går inte att boka tid på, och
    // skulle stå tom för alltid. Befintliga stationer lämnas i fred: momentet
    // kan ha avaktiverats efteråt, och stationen bär historik.
    return { error: "Arbetsmomentet är avaktiverat." };
  }

  const existing = input.stationId
    ? await db.station.findFirst({
        where: { id: input.stationId },
        select: {
          id: true,
          momentId: true,
          _count: { select: { blocks: true } },
        },
      })
    : null;

  if (input.stationId && !existing) return { error: "Stationen finns inte." };

  if (
    existing &&
    existing.momentId !== input.momentId &&
    existing._count.blocks > 0
  ) {
    return {
      error:
        "Stationen har planerad tid och kan inte byta arbetsmoment. " +
        "Stäng den och lägg upp en ny.",
    };
  }

  let stationId = existing?.id;

  try {
    if (existing) {
      await db.station.updateMany({
        where: { id: existing.id },
        data: { name, momentId: input.momentId },
      });
    } else {
      // Sist i listan. Ordningen ändras med pilarna, och en ny station ska
      // inte hamna överst bara för att den är ny.
      const count = await db.station.count();

      const created = await db.station.create({
        data: { companyId, name, momentId: input.momentId, sortOrder: count },
        select: { id: true },
      });

      stationId = created.id;
    }
  } catch (error) {
    // P2002: namnet är unikt per företag.
    if ((error as { code?: string } | null)?.code === "P2002") {
      return { error: "Det finns redan en station med det namnet." };
    }
    throw error;
  }

  if (!stationId) return { error: "Stationen kunde inte sparas." };

  await db.stationDay.deleteMany({ where: { stationId } });

  for (const day of input.days) {
    await db.stationDay.create({
      data: {
        companyId,
        stationId,
        weekday: day.weekday,
        startMinute: day.startMinute,
        endMinute: day.endMinute,
        breaks: {
          create: day.breaks.map((rest) => ({
            companyId,
            startMinute: rest.startMinute,
            endMinute: rest.endMinute,
          })),
        },
      },
    });
  }

  return { id: stationId };
}

/**
 * Stänger eller öppnar en station.
 *
 * EN STATION RADERAS ALDRIG, den stängs — samma regel som ordrar och moment med
 * registrerad tid (§ 3 regel 1). Men den stängs inte heller med planerad tid
 * framför sig: tavlan visar bara öppna stationer, och rutorna hade försvunnit
 * ur vyn utan att försvinna ur databasen. Äldre rutor är historik och hindrar
 * ingenting.
 */
export async function setStationActive(
  db: CompanyDb,
  timeZone: string,
  stationId: string,
  active: boolean
): Promise<PlanResult> {
  const station = await db.station.findFirst({
    where: { id: stationId },
    select: { id: true },
  });

  if (!station) return { error: "Stationen finns inte." };

  if (!active) {
    const today = startOfDayIn(new Date(), timeZone);

    const upcoming = await db.plannedBlock.count({
      where: { stationId, startsAt: { gte: today } },
    });

    if (upcoming > 0) {
      return {
        error:
          `Stationen har ${upcoming} planerade jobb kvar. ` +
          "Flytta eller ta bort dem först.",
      };
    }
  }

  await db.station.updateMany({ where: { id: stationId }, data: { active } });
  return { id: stationId };
}

/** Flyttar en station ett steg i listan. Ordningen följer flödet i lokalen. */
export async function moveStation(
  db: CompanyDb,
  stationId: string,
  direction: "up" | "down"
): Promise<PlanResult> {
  const stations = await db.station.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  const index = stations.findIndex((station) => station.id === stationId);
  if (index < 0) return { error: "Stationen finns inte." };

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= stations.length) return {};

  const reordered = [...stations];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  // Hela listan skrivs om. Att byta två tal räcker när de är olika, men en
  // lista där flera rader råkar ha samma sortOrder — vilket händer när rader
  // lagts upp samtidigt — hade då bytt plats på fel par.
  for (const [order, station] of reordered.entries()) {
    await db.station.updateMany({
      where: { id: station.id },
      data: { sortOrder: order },
    });
  }

  return { id: stationId };
}
