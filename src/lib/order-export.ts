import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";

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
  momentName: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  minutes: number;
  ongoing: boolean;
  needsReview: boolean;
  manual: boolean;
}

export interface OrderExport {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  status: string;
  /** Beräknad tid i minuter, eller null. Visas i underlaget för jämförelse. */
  budgetMinutes: number | null;
  rows: OrderExportRow[];
  totalMinutes: number;
  /** Poster där sluttiden är gissad av systemet och ännu inte granskad. */
  ungradedCount: number;
  /** Poster som fortfarande pågår. Tiden fortsätter räknas upp. */
  ongoingCount: number;
  firstEntryAt: Date | null;
  lastEntryAt: Date | null;
}

export async function getOrderExports(
  db: CompanyDb,
  orderIds: string[]
): Promise<OrderExport[]> {
  if (orderIds.length === 0) return [];

  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    orderBy: { orderNumber: "asc" },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      status: true,
      budgetMinutes: true,
      timeEntries: {
        orderBy: { clockInAt: "asc" },
        select: {
          clockInAt: true,
          clockOutAt: true,
          needsReview: true,
          source: true,
          employee: { select: { name: true } },
          moment: { select: { name: true } },
        },
      },
    },
  });

  return orders.map((order) => {
    const rows: OrderExportRow[] = order.timeEntries.map((entry) => ({
      employeeName: entry.employee.name,
      momentName: entry.moment.name,
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
      customerName: order.customerName,
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
