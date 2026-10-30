import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";
import { budgetTotal } from "./order-budget";

/**
 * ORDERLISTAN SOM TABELLEN VISAR.
 *
 * Egen fil eftersom listan numera ritas på två ställen: under Ordrar och på
 * kundens sida. Samma frågor och samma hopräkning båda gångerna — annars är
 * det en tidsfråga innan en order ser olika ut beroende på var man tittar,
 * och då är det inte längre samma order i användarens huvud.
 *
 * Ingenting cachas. Upparbetad tid räknas ur stämplingarna vid varje besök, så
 * att en rättad post slår igenom bakåt.
 */

/** Beräknad tid för ett arbetsmoment, med utfallet bredvid. */
export interface OrderBudgetRow {
  momentId: string;
  momentName: string;
  /** Beräknad tid i minuter. */
  minutes: number;
  /** Upparbetad tid på just det här momentet, i minuter. */
  usedMinutes: number;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  status: string;
  entries: number;
  minutes: number;
  /**
   * Orderns beräknade tid i minuter: summan av raderna nedan, eller null när
   * ingen beräkning gjorts. Lagras inte — se src/lib/order-budget.ts.
   */
  budgetMinutes: number | null;
  /** Beräkningen uppdelad per arbetsmoment. Tom när ingen gjorts. */
  budgets: OrderBudgetRow[];
  /** Orderns eget påslag i procent, eller null för företagets standard. */
  markupPercent: number | null;
  /** Avtalat fast pris i ören, eller null för löpande räkning. */
  fixedPriceOre: number | null;
  /** Skapad från en stämplingsskärm och ännu inte kompletterad av admin. */
  isQuickJob: boolean;
  /**
   * När jobbet ska vara klart, eller null när inget datum satts.
   *
   * Hör till tillvalet Planering och styr ordningen i Oplacerat. Fältet läses
   * alltid — raden är billig och basen visar den inte — men FÄLTET i
   * orderrutan visas bara när modulen är på. Se CLAUDE.md § 3.1.
   */
  plannedDueDate: Date | null;
}

/** Tiden på ett arbetsmoment på en order, med beräkningen bredvid. */
export interface OrderMomentRow {
  momentId: string;
  momentName: string;
  /** Upparbetad tid i minuter. */
  minutes: number;
  /** Beräknad tid i minuter, eller null för ett moment utan beräkning. */
  budgetMinutes: number | null;
}

/** Vilka ordrar en lista gäller. `orderRows` och `orderCount` delar urvalet. */
interface OrderSelection {
  customerId?: string;
  onlyQuickJobs?: boolean;
  /**
   * Bara de här ordrarna. Översikten visar en handfull ordrar i arbete, och
   * ska räkna deras tid exakt som orderlistan gör — men inte hämta varje
   * stämpling på varje order för att visa åtta av dem.
   */
  ids?: string[];
  query?: string;
}

function orderFilter(options: OrderSelection) {
  const needle = options.query?.trim();

  return {
    ...(options.customerId ? { customerId: options.customerId } : {}),
    ...(options.onlyQuickJobs ? { isQuickJob: true } : {}),
    ...(options.ids ? { id: { in: options.ids } } : {}),
    ...(needle
      ? {
          OR: [
            { orderNumber: { contains: needle, mode: "insensitive" as const } },
            {
              customer: {
                name: { contains: needle, mode: "insensitive" as const },
              },
            },
            {
              customer: {
                customerNumber: {
                  contains: needle,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
  };
}

/** Antalet ordrar i ett urval, för en lista som bara hämtar en sida. */
export function orderCount(
  db: CompanyDb,
  options: OrderSelection = {}
): Promise<number> {
  return db.order.count({ where: orderFilter(options) });
}

/**
 * Ordrarna med upparbetad tid, beräkning och utfall per arbetsmoment.
 *
 * `customerId` begränsar till en kunds ordrar. Utelämnad ger företagets alla.
 * `onlyQuickJobs` ger bara de som skapats från en stämplingsskärm och ännu
 * inte kompletterats — det granskningssidan visar.
 *
 * `query` söker i ordernummer, kundens namn och kundnummer, skiftlägesokänsligt
 * som kundregistret. Den som har ordernumret på en följesedel ska hitta ordern,
 * och den som bara minns kunden likaså. Tom sökning ger alla.
 *
 * `skip` och `take` hämtar en sida. Varje rad drar med sig orderns alla
 * stämplingar, så att bläddra i databasen är det som håller listan snabb.
 */
export async function orderRows(
  db: CompanyDb,
  options: OrderSelection & { skip?: number; take?: number } = {}
): Promise<OrderRow[]> {
  const orders = await db.order.findMany({
    where: orderFilter(options),
    orderBy: [{ status: "asc" }, { orderNumber: "asc" }],
    skip: options.skip,
    take: options.take,
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      customer: { select: { name: true } },
      status: true,
      markupPercent: true,
      fixedPriceOre: true,
      isQuickJob: true,
      plannedDueDate: true,
      // Beräknad tid är egna rader, en per arbetsmoment. Orderns totala
      // beräkning är summan av dem — se src/lib/order-budget.ts.
      budgets: {
        // Orderns egen ordning, inte alfabetisk. Raderna säger i vilken följd
        // momenten ska göras, och den uppgiften går förlorad om listan
        // sorteras om på vägen ut.
        orderBy: { sortOrder: "asc" },
        select: {
          momentId: true,
          minutes: true,
          moment: { select: { name: true } },
        },
      },
      timeEntries: {
        select: { clockInAt: true, clockOutAt: true, momentId: true },
      },
    },
  });

  return orders.map((order) => {
    // Upparbetad tid per moment, så att varje beräkning går att jämföra med
    // sitt eget utfall och inte bara med orderns total.
    const usedByMoment = new Map<string, number>();

    for (const entry of order.timeEntries) {
      if (!entry.momentId) continue;
      usedByMoment.set(
        entry.momentId,
        (usedByMoment.get(entry.momentId) ?? 0) +
          minutesBetween(entry.clockInAt, entry.clockOutAt)
      );
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customer?.name ?? null,
      status: order.status,
      budgetMinutes: budgetTotal(order.budgets),
      budgets: order.budgets.map((budget) => ({
        momentId: budget.momentId,
        momentName: budget.moment.name,
        minutes: budget.minutes,
        usedMinutes: usedByMoment.get(budget.momentId) ?? 0,
      })),
      markupPercent: order.markupPercent,
      fixedPriceOre: order.fixedPriceOre,
      isQuickJob: order.isQuickJob,
      plannedDueDate: order.plannedDueDate,
      entries: order.timeEntries.length,
      minutes: order.timeEntries.reduce(
        (total, entry) =>
          total + minutesBetween(entry.clockInAt, entry.clockOutAt),
        0
      ),
    };
  });
}

/**
 * Tiden per arbetsmoment på en order, för orderns egen sida.
 *
 * `budgets` räcker inte: den bär bara momenten som fått en beräkning, och tid
 * på ett annat moment hade då saknats i tabellen utan att något sa det. De
 * beräknade momenten står först, i orderns egen ordning, och resten efter namn.
 */
export async function orderMoments(
  db: CompanyDb,
  order: Pick<OrderRow, "id" | "budgets">
): Promise<OrderMomentRow[]> {
  const entries = await db.timeEntry.findMany({
    where: { orderId: order.id },
    select: {
      clockInAt: true,
      clockOutAt: true,
      momentId: true,
      moment: { select: { name: true } },
    },
  });

  const budgeted = new Set(order.budgets.map((budget) => budget.momentId));
  const others = new Map<string, OrderMomentRow>();

  for (const entry of entries) {
    if (!entry.momentId || !entry.moment) continue;
    if (budgeted.has(entry.momentId)) continue;

    const row = others.get(entry.momentId) ?? {
      momentId: entry.momentId,
      momentName: entry.moment.name,
      minutes: 0,
      budgetMinutes: null,
    };

    row.minutes += minutesBetween(entry.clockInAt, entry.clockOutAt);
    others.set(entry.momentId, row);
  }

  return [
    ...order.budgets.map((budget) => ({
      momentId: budget.momentId,
      momentName: budget.momentName,
      minutes: budget.usedMinutes,
      budgetMinutes: budget.minutes,
    })),
    ...[...others.values()].sort((a, b) =>
      a.momentName.localeCompare(b.momentName, "sv")
    ),
  ];
}
