import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";
import { applyMarkup, costForMinutes } from "./money";

/**
 * KALKYL PER ORDER — vad jobbet kostat, och vad det ska ge.
 *
 * Skild från order-export.ts med flit, trots att frågorna liknar varandra.
 * Det här är ett INTERNT underlag med självkostnad och marginal; det andra är
 * ett dokument som går vidare till kundens kund. Den som en dag lägger till ett
 * fält här ska inte kunna råka få ut det på fel papper.
 *
 * Separationen syns i importgrafen: calc-pdf.ts ser bara den här filen, pdf.ts
 * ser bara order-export.ts, och ingen fil ser båda. Priset är ett trettiotal
 * rader som liknar varandra. Det är ett lågt pris för att ett misstag ska
 * kräva att någon skriver om en import i stället för att glömma ett filter.
 *
 * Raderna grupperas per arbetsmoment OCH timkostnad. Normalt blir det en rad
 * per moment. Har kostnaden höjts mitt under ordern blir det två — vilket är
 * det ärliga svaret, eftersom stämplingarna faktiskt kostade olika mycket.
 */

export interface OrderCalcRow {
  momentName: string;
  minutes: number;
  /** Timkostnaden som gällde vid stämplingen. null när ingen var angiven. */
  costRateOre: number | null;
  /** Radens kostnad, eller null när timkostnad saknas. */
  costOre: number | null;
}

export interface OrderCalc {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  rows: OrderCalcRow[];
  totalMinutes: number;
  /** Summan av de rader som HAR en timkostnad. */
  totalCostOre: number;
  /**
   * Tid utan angiven timkostnad. Är den större än noll är kalkylen
   * ofullständig, och dokumentet säger det rakt ut i stället för att visa en
   * för låg summa som ser färdig ut.
   */
  minutesWithoutRate: number;
  markupPercent: number;
  /** true när påslaget kommer från ordern och inte från företagets standard. */
  markupFromOrder: boolean;
  /**
   * Priset mot kund. Orderns fasta pris när ett sådant finns, annars
   * självkostnaden uppräknad med påslaget.
   */
  priceOre: number;
  /** true när priset är ett avtalat fast pris och inte framräknat. */
  priceIsFixed: boolean;
  /** Pris minus självkostnad. Kan vara negativt — en order kan gå med förlust. */
  profitOre: number;
  /**
   * Vinsten som andel av SJÄLVKOSTNADEN, i procent — samma räkning som
   * kundens eget kalkylark gör. Null när kostnaden är noll, för då finns
   * ingen nämnare och "oändlig marginal" är inget att skriva på ett papper.
   */
  profitPercent: number | null;
  ongoingCount: number;
  ungradedCount: number;
  firstEntryAt: Date | null;
  lastEntryAt: Date | null;
}

export async function getOrderCalcs(
  db: CompanyDb,
  orderIds: string[],
  companyMarkupPercent: number
): Promise<OrderCalc[]> {
  if (orderIds.length === 0) return [];

  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    orderBy: { orderNumber: "asc" },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      markupPercent: true,
      fixedPriceOre: true,
      timeEntries: {
        orderBy: { clockInAt: "asc" },
        select: {
          clockInAt: true,
          clockOutAt: true,
          needsReview: true,
          costRateOre: true,
          moment: { select: { id: true, name: true } },
        },
      },
    },
  });

  return orders.map((order) => {
    // Nyckeln bär både momentet och kostnaden. Två stämplingar på samma
    // moment till olika timpris ska inte slås ihop till en rad med ett pris
    // som ingen av dem hade.
    const groups = new Map<string, OrderCalcRow>();

    let totalMinutes = 0;
    let totalCostOre = 0;
    let minutesWithoutRate = 0;
    let ongoingCount = 0;
    let ungradedCount = 0;

    for (const entry of order.timeEntries) {
      const minutes = minutesBetween(entry.clockInAt, entry.clockOutAt);
      totalMinutes += minutes;

      if (entry.clockOutAt === null) ongoingCount += 1;
      if (entry.needsReview) ungradedCount += 1;

      const rate = entry.costRateOre;
      if (rate === null) minutesWithoutRate += minutes;

      const key = `${entry.moment.id}|${rate ?? "saknas"}`;
      const existing = groups.get(key);

      if (existing) {
        existing.minutes += minutes;
      } else {
        groups.set(key, {
          momentName: entry.moment.name,
          minutes,
          costRateOre: rate,
          costOre: null,
        });
      }
    }

    // Kostnaden räknas ut EN gång per grupp, på gruppens hela tid. Hade varje
    // stämpling avrundats för sig och summerats skulle ören försvinna för
    // varje rad, och totalen inte stämma med det kunden räknar för hand.
    const rows = [...groups.values()].map((row) => {
      if (row.costRateOre === null) return row;

      const costOre = costForMinutes(row.minutes, row.costRateOre);
      totalCostOre += costOre;

      return { ...row, costOre };
    });

    // Dyrast först. Den som läser en kalkyl vill veta vad som kostade mest,
    // inte i vilken ordning momenten råkar heta något.
    rows.sort((a, b) => (b.costOre ?? -1) - (a.costOre ?? -1));

    const markupPercent = order.markupPercent ?? companyMarkupPercent;

    // Ett avtalat pris går före ett framräknat. Har man kommit överens om
    // 7 350 kr är det priset, oavsett vad påslaget skulle ha gett.
    const priceIsFixed = order.fixedPriceOre !== null;
    const priceOre =
      order.fixedPriceOre ?? applyMarkup(totalCostOre, markupPercent);
    const profitOre = priceOre - totalCostOre;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      rows,
      totalMinutes,
      totalCostOre,
      minutesWithoutRate,
      markupPercent,
      markupFromOrder: order.markupPercent !== null,
      priceOre,
      priceIsFixed,
      profitOre,
      profitPercent:
        totalCostOre > 0 ? Math.round((profitOre / totalCostOre) * 100) : null,
      ongoingCount,
      ungradedCount,
      firstEntryAt: order.timeEntries[0]?.clockInAt ?? null,
      lastEntryAt:
        order.timeEntries[order.timeEntries.length - 1]?.clockInAt ?? null,
    };
  });
}
