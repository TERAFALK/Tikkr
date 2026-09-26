import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";
import { costForMinutes } from "./money";
import { priceForOrder, type OrderPrice } from "./order-price";

/**
 * EFTERKALKYL PER ORDER — vad jobbet kostat, och vad det ska ge.
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
 * Formen följer den efterkalkyl kunden läser idag: varje stämpling på egen rad,
 * grupperad per arbetsmoment, med en delsumma per grupp och en total sist.
 * Grupperna kommer dyrast först — den som öppnar en efterkalkyl vill veta vad
 * som kostade mest, inte i vilken ordning momenten råkar heta något.
 */

/** En enskild stämpling, som den står på sin rad i kalkylen. */
export interface OrderCalcEntry {
  employeeName: string;
  employeeNumber: string | null;
  clockInAt: Date;
  clockOutAt: Date | null;
  minutes: number;
  /**
   * Satserna som gällde vid stämplingen. null när ingen var angiven.
   *
   * Redovisas var för sig och inte bara som summa. "850 kr/tim" går inte att
   * ifrågasätta; "person 350 + maskin 500" går att kontrollera mot vad man
   * själv skrivit in.
   */
  employeeCostRateOre: number | null;
  momentCostRateOre: number | null;
  /**
   * Summan av de satser som FINNS, eller null när ingen av dem finns.
   *
   * Saknad sats är inte noll. Har personen ingen sats räknas maskinen ensam,
   * precis som förut — men saknas båda är raden utan underlag, och den ska
   * inte tyst bidra med noll kronor till en total.
   */
  costRateOre: number | null;
  /** Radens kostnad, eller null när båda satserna saknas. */
  costOre: number | null;
  ongoing: boolean;
  needsReview: boolean;
  manual: boolean;
}

/** Ett arbetsmoment med sina stämplingar och sin delsumma. */
export interface OrderCalcGroup {
  momentId: string;
  momentName: string;
  entries: OrderCalcEntry[];
  minutes: number;
  /** Summan av de rader som HAR en timkostnad. */
  costOre: number;
  /** Tid i gruppen som saknar timkostnad och därför inte ingår i costOre. */
  minutesWithoutRate: number;
}

export interface OrderCalc {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  groups: OrderCalcGroup[];
  entryCount: number;
  totalMinutes: number;
  totalCostOre: number;
  /**
   * Tid utan angiven timkostnad. Är den större än noll är kalkylen
   * ofullständig, och dokumentet säger det rakt ut i stället för att visa en
   * för låg summa som ser färdig ut.
   */
  minutesWithoutRate: number;
  markupPercent: number;
  /** true när påslaget kommer från ordern och inte från kunden eller företaget. */
  markupFromOrder: boolean;
  /**
   * Priset uppdelat: före rabatt, rabatten, och att betala.
   *
   * Samma objekt som kundens underlag får. Delat med flit — två uppräkningar
   * av samma pris är två chanser att de båda dokumenten säger olika saker.
   */
  price: OrderPrice;
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
      customer: {
        select: { name: true, markupPercent: true, discountPercent: true },
      },
      markupPercent: true,
      fixedPriceOre: true,
      timeEntries: {
        // Improduktiv tid kan aldrig ha en order, men filtret sager vad
        // fragan handlar om och kostar ingenting.
        where: { kind: "ORDER" },
        orderBy: { clockInAt: "asc" },
        select: {
          clockInAt: true,
          clockOutAt: true,
          needsReview: true,
          source: true,
          momentCostRateOre: true,
          employeeCostRateOre: true,
          employee: { select: { name: true, employeeNumber: true } },
          moment: { select: { id: true, name: true } },
        },
      },
    },
  });

  return orders.map((order) => {
    const groups = new Map<string, OrderCalcGroup>();

    let totalMinutes = 0;
    let totalCostOre = 0;
    let minutesWithoutRate = 0;
    let ongoingCount = 0;
    let ungradedCount = 0;

    for (const entry of order.timeEntries) {
      const minutes = minutesBetween(entry.clockInAt, entry.clockOutAt);

      // Satserna LÄGGS IHOP: människan och maskinen kostar samtidigt. Saknas
      // en av dem räknas den andra ensam — saknad sats betyder att den inte är
      // angiven, inte att den är noll.
      //
      // Saknas BÅDA är raden utan underlag. Den räknas då inte in i totalen
      // utan redovisas som saknad tid, i stället för att tyst dra ner summan.
      const costRateOre =
        entry.employeeCostRateOre === null && entry.momentCostRateOre === null
          ? null
          : (entry.employeeCostRateOre ?? 0) + (entry.momentCostRateOre ?? 0);

      // Kostnaden räknas per rad, precis som i den rapport kunden läser idag.
      // Det gör att en enskild rad går att kontrollräkna för hand — vilket är
      // vad man gör när en siffra ser fel ut.
      const costOre =
        costRateOre === null ? null : costForMinutes(minutes, costRateOre);

      totalMinutes += minutes;
      if (costOre === null) minutesWithoutRate += minutes;
      else totalCostOre += costOre;

      if (entry.clockOutAt === null) ongoingCount += 1;
      if (entry.needsReview) ungradedCount += 1;

      // Frågan filtrerar på kind ORDER, så momentet finns. Fallbacken är
      // inte en gissning utan en vägran att krascha på data som inte ska
      // kunna uppstå.
      const momentId = entry.moment?.id ?? "";

      const group = groups.get(momentId) ?? {
        momentId,
        momentName: entry.moment?.name ?? "Okänt arbetsmoment",
        entries: [],
        minutes: 0,
        costOre: 0,
        minutesWithoutRate: 0,
      };

      group.entries.push({
        employeeName: entry.employee.name,
        employeeNumber: entry.employee.employeeNumber,
        clockInAt: entry.clockInAt,
        clockOutAt: entry.clockOutAt,
        minutes,
        employeeCostRateOre: entry.employeeCostRateOre,
        momentCostRateOre: entry.momentCostRateOre,
        costRateOre,
        costOre,
        ongoing: entry.clockOutAt === null,
        needsReview: entry.needsReview,
        manual: entry.source === "ADMIN_MANUAL",
      });

      group.minutes += minutes;
      if (costOre === null) group.minutesWithoutRate += minutes;
      else group.costOre += costOre;

      groups.set(momentId, group);
    }

    const sorted = [...groups.values()].sort((a, b) => b.costOre - a.costOre);

    // Hela prisräkningen ligger i order-price.ts, som också är det enda
    // kundens underlag får se. Delad med flit: två uppräkningar av samma pris
    // är två chanser att kalkylen och underlaget säger olika saker.
    const price = priceForOrder({
      costOre: totalCostOre,
      orderMarkupPercent: order.markupPercent,
      customerMarkupPercent: order.customer?.markupPercent ?? null,
      companyMarkupPercent,
      customerDiscountPercent: order.customer?.discountPercent ?? null,
      fixedPriceOre: order.fixedPriceOre,
    });

    const profitOre = price.priceOre - totalCostOre;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? null,
      groups: sorted,
      entryCount: order.timeEntries.length,
      totalMinutes,
      totalCostOre,
      minutesWithoutRate,
      markupPercent: price.markupPercent,
      markupFromOrder: price.markupSource === "order",
      price,
      priceOre: price.priceOre,
      priceIsFixed: price.isFixed,
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
