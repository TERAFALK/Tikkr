import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";
import { applyMarkup, costForMinutes } from "./money";

/**
 * VAD KUNDEN FÅR SE AV PRISET — OCH INGENTING MER.
 *
 * Filen finns för att en gräns skulle flyttas utan att rivas.
 *
 * Tidigare gällde: `order-export.ts` → `pdf.ts` är dokumentet som går till
 * kundens kund och innehåller BARA TID. `order-calc.ts` → `calc-pdf.ts` är det
 * interna underlaget med självkostnad och marginal. Ingen fil ser båda.
 *
 * Med rabatt på kundens underlag måste priset gå till kunden. Men det viktiga
 * var aldrig att kunden slipper se kronor — det var att kunden ALDRIG ser er
 * självkostnad eller marginal. Den delen står kvar, och görs starkare:
 *
 *   - `OrderPrice` har inga kostnads- eller marginalfält. Att läcka
 *     självkostnad genom den här vägen blir ett TYPFEL, inte en fråga om att
 *     någon minns en regel.
 *   - `order-calc.ts` använder den, så kalkylens pris och underlagets pris
 *     aldrig kan glida isär.
 *   - `order-export.ts` och `pdf.ts` importerar bara den här filen, aldrig
 *     `order-calc.ts`.
 *
 * PRISORDNINGEN:
 *
 *   självkostnad   (person + maskin, ögonblicksbild på stämplingen)
 *     × påslag      order → kund → företag, första ifyllda vinner
 *     − rabatt      kundens procent
 *     = pris
 *
 * Ett avtalat fast pris går före allt. Då finns priset redan, och rabatten
 * tillämpas inte — den är redan inräknad i det man kommit överens om.
 */

export interface PriceInput {
  /** Självkostnaden i ören. Lämnar aldrig den här filen. */
  costOre: number;
  /** Orderns eget påslag i procent, eller null. */
  orderMarkupPercent: number | null;
  /** Kundens påslag i procent, eller null. */
  customerMarkupPercent: number | null;
  /** Företagets standardpåslag i procent. Alltid satt. */
  companyMarkupPercent: number;
  /** Kundens stående rabatt i procent, eller null. */
  customerDiscountPercent: number | null;
  /** Avtalat fast pris i ören, eller null för löpande räkning. */
  fixedPriceOre: number | null;
}

export interface OrderPrice {
  /** Priset innan rabatt. Självkostnaden uppräknad med påslaget. */
  priceBeforeDiscountOre: number;
  /** Rabatten i procent, eller null när ingen gäller. */
  discountPercent: number | null;
  /** Rabatten i ören. Noll när ingen gäller. */
  discountOre: number;
  /** Att betala. Det enda talet som hör hemma på kundens underlag. */
  priceOre: number;
  /** true när priset är avtalat och inte framräknat. */
  isFixed: boolean;
  /** Påslaget som användes, i procent. */
  markupPercent: number;
  /** Var påslaget kom ifrån. Styr vad kalkylen skriver ut. */
  markupSource: "order" | "customer" | "company";
}

export function priceForOrder(input: PriceInput): OrderPrice {
  // Ordningen är order → kund → företag. Det specifika vinner över det
  // allmänna: har någon förhandlat en enskild order gäller den siffran, annars
  // kundens, annars företagets.
  const markupPercent =
    input.orderMarkupPercent ??
    input.customerMarkupPercent ??
    input.companyMarkupPercent;

  const markupSource =
    input.orderMarkupPercent !== null
      ? "order"
      : input.customerMarkupPercent !== null
        ? "customer"
        : "company";

  if (input.fixedPriceOre !== null) {
    // Fast pris. Rabatten tillämpas INTE — det avtalade beloppet är vad kunden
    // ska betala, och att dra av tio procent till vore att ge bort något man
    // redan kommit överens om.
    return {
      priceBeforeDiscountOre: input.fixedPriceOre,
      discountPercent: null,
      discountOre: 0,
      priceOre: input.fixedPriceOre,
      isFixed: true,
      markupPercent,
      markupSource,
    };
  }

  const priceBeforeDiscountOre = applyMarkup(input.costOre, markupPercent);

  const discountPercent =
    input.customerDiscountPercent && input.customerDiscountPercent > 0
      ? input.customerDiscountPercent
      : null;

  // Avrundas till helt öre här och inte i slutet. Rabatten redovisas som ett
  // eget belopp på underlaget, och de tre talen måste gå ihop när någon
  // kontrollräknar dem för hand.
  const discountOre =
    discountPercent === null
      ? 0
      : Math.round((priceBeforeDiscountOre * discountPercent) / 100);

  return {
    priceBeforeDiscountOre,
    discountPercent,
    discountOre,
    priceOre: priceBeforeDiscountOre - discountOre,
    isFixed: false,
    markupPercent,
    markupSource,
  };
}

/**
 * Priserna för en handfull ordrar, hämtade och uträknade här.
 *
 * Finns för att `order-export.ts` ska kunna visa ett pris UTAN att någonsin se
 * en självkostnad. Hade den fått räkna själv skulle kostnaden ha funnits som
 * en variabel i filen, och nästa person som lägger till ett fält där hade haft
 * den inom räckhåll. Nu går den aldrig ut ur den här funktionen.
 *
 * Kostnaden räknas likadant som i `order-calc.ts`: per rad, med satserna som
 * gällde vid stämplingen, summerade till öret. Att de två stämmer överens
 * bevisas av tests/order-price.test.ts.
 */
export async function getOrderPrices(
  db: CompanyDb,
  orderIds: string[],
  companyMarkupPercent: number
): Promise<Map<string, OrderPrice>> {
  if (orderIds.length === 0) return new Map();

  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      markupPercent: true,
      fixedPriceOre: true,
      customer: { select: { markupPercent: true, discountPercent: true } },
      timeEntries: {
        where: { kind: "ORDER" },
        select: {
          clockInAt: true,
          clockOutAt: true,
          momentCostRateOre: true,
          employeeCostRateOre: true,
        },
      },
    },
  });

  const prices = new Map<string, OrderPrice>();

  for (const order of orders) {
    let costOre = 0;

    for (const entry of order.timeEntries) {
      // Saknas BÅDA satserna har raden inget underlag och bidrar med noll —
      // men den räknas som saknad tid i kalkylen, inte som gratis arbete. Se
      // order-calc.ts, som redovisar den skillnaden.
      const rate =
        entry.employeeCostRateOre === null && entry.momentCostRateOre === null
          ? null
          : (entry.employeeCostRateOre ?? 0) + (entry.momentCostRateOre ?? 0);

      if (rate === null) continue;

      costOre += costForMinutes(
        minutesBetween(entry.clockInAt, entry.clockOutAt),
        rate
      );
    }

    prices.set(
      order.id,
      priceForOrder({
        costOre,
        orderMarkupPercent: order.markupPercent,
        customerMarkupPercent: order.customer?.markupPercent ?? null,
        companyMarkupPercent,
        customerDiscountPercent: order.customer?.discountPercent ?? null,
        fixedPriceOre: order.fixedPriceOre,
      })
    );
  }

  return prices;
}
