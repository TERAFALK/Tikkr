import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";
import { getOrderPrices, type OrderPrice } from "./order-price";

/**
 * UNDERLAG PER ORDER.
 *
 * Skiljer sig från rapportvyn på ett avgörande sätt: det här är ett dokument
 * som skickas vidare till kundens kund, som bilaga till en faktura. Rapporten
 * svarar på "hur ligger vi till", det här svarar på "det här har ni betalat
 * för".
 *
 * Därför en order per dokument, med ordernummer och kundnamn överst och en
 * summa längst ner — inte en lång lista där mottagaren själv får leta reda på
 * sina rader.
 */

export interface OrderExportRow {
  employeeName: string;
  employeeNumber: string | null;
  momentName: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  minutes: number;
  ongoing: boolean;
  needsReview: boolean;
  manual: boolean;
}

/**
 * Kundens uppgifter, som de står i sidhuvudet.
 *
 * Fanns inte före kundregistret — då skrevs de för hand varje gång ett
 * underlag skulle bifogas en faktura.
 */
export interface OrderExportCustomer {
  name: string;
  orgNumber: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
}

export interface OrderExport {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customer: OrderExportCustomer | null;
  /**
   * Priset, NÄR DET BEGÄRTS. null när underlaget ska visa bara tid.
   *
   * Kommer från order-price.ts, som är den enda vägen hit. Självkostnad och
   * marginal finns inte i typen — att läcka dem till kundens dokument är
   * därmed ett typfel och inte en fråga om disciplin. Se order-calc.ts.
   */
  price: OrderPrice | null;
  status: string;
  /** Beräknad tid i minuter, eller null. Visas i underlaget för jämförelse. */
  budgetMinutes: number | null;
  rows: OrderExportRow[];
  totalMinutes: number;
  /** Poster där sluttiden är beräknad av systemet och ännu inte granskad. */
  ungradedCount: number;
  /** Poster som fortfarande pågår. Tiden fortsätter räknas upp. */
  ongoingCount: number;
  firstEntryAt: Date | null;
  lastEntryAt: Date | null;
}

export interface OrderExportOptions {
  /**
   * Tar med pris och rabatt.
   *
   * Ett val vid uttaget, inte ett läge på kunden. Utan det ser underlaget ut
   * precis som förut — bara tid — och den som bara ska visa hur många timmar
   * ett jobb tog behöver inte skicka med ett belopp.
   */
  withPrice?: boolean;
  /** Företagets standardpåslag. Krävs när priset ska med. */
  companyMarkupPercent?: number;
}

export async function getOrderExports(
  db: CompanyDb,
  orderIds: string[],
  options: OrderExportOptions = {}
): Promise<OrderExport[]> {
  if (orderIds.length === 0) return [];

  // Priset hämtas för sig, genom order-price.ts. Den här filen får aldrig se
  // en självkostnad — se kommentaren på OrderExport.price.
  const prices =
    options.withPrice && options.companyMarkupPercent !== undefined
      ? await getOrderPrices(db, orderIds, options.companyMarkupPercent)
      : null;

  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    orderBy: { orderNumber: "asc" },
    select: {
      id: true,
      orderNumber: true,
      customer: {
        select: {
          name: true,
          orgNumber: true,
          addressLine: true,
          postalCode: true,
          city: true,
        },
      },
      status: true,
      budgetMinutes: true,
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
          employee: { select: { name: true, employeeNumber: true } },
          moment: { select: { name: true } },
        },
      },
    },
  });

  return orders.map((order) => {
    const rows: OrderExportRow[] = order.timeEntries.map((entry) => ({
      employeeName: entry.employee.name,
      employeeNumber: entry.employee.employeeNumber,
      momentName: entry.moment?.name ?? "",
      clockInAt: entry.clockInAt,
      clockOutAt: entry.clockOutAt,
      minutes: minutesBetween(entry.clockInAt, entry.clockOutAt),
      ongoing: entry.clockOutAt === null,
      needsReview: entry.needsReview,
      manual: entry.source === "ADMIN_MANUAL",
    }));

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? null,
      customer: order.customer,
      price: prices?.get(order.id) ?? null,
      status: order.status,
      budgetMinutes: order.budgetMinutes,
      rows,
      totalMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
      ungradedCount: rows.filter((row) => row.needsReview).length,
      ongoingCount: rows.filter((row) => row.ongoing).length,
      firstEntryAt: rows[0]?.clockInAt ?? null,
      lastEntryAt: rows[rows.length - 1]?.clockInAt ?? null,
    };
  });
}

/** Filnamnsvänlig text. Används i namnet på den nedladdade filen. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
