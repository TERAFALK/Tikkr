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

/**
 * Ordrarna med upparbetad tid, beräkning och utfall per arbetsmoment.
 *
 * `customerId` begränsar till en kunds ordrar. Utelämnad ger företagets alla.
 * `onlyQuickJobs` ger bara de som skapats från en stämplingsskärm och ännu
 * inte kompletterats — det granskningssidan visar.
 */
export async function orderRows(
  db: CompanyDb,
  options: { customerId?: string; onlyQuickJobs?: boolean } = {}
): Promise<OrderRow[]> {
  const orders = await db.order.findMany({
    where: {
      ...(options.customerId ? { customerId: options.customerId } : {}),
      ...(options.onlyQuickJobs ? { isQuickJob: true } : {}),
    },
    orderBy: [{ status: "asc" }, { orderNumber: "asc" }],
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
