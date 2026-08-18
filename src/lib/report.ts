import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";

/**
 * RAPPORTERNA.
 *
 * Det här är vad kunden betalar för: svaret på "hur mycket tid har lagts på
 * order 2601, och av vem". Siffrorna går vidare till en faktura, så de måste
 * vara rätt — därför ligger räkningen här, fri från gränssnitt, och täcks av
 * tester.
 *
 * Ett medvetet val: pågående jobb räknas fram till NU. En rapport som tas mitt
 * på dagen visar alltså tid som ännu inte är avslutad, tydligt märkt. Att
 * utelämna dem hade varit missvisande på ett värre sätt — man skulle tro att
 * ingen jobbat.
 */

export interface ReportFilters {
  /** Stämplingar som PÅBÖRJATS från och med denna tidpunkt. */
  from?: Date;
  /** Stämplingar som påbörjats till och med denna tidpunkt. */
  to?: Date;
  employeeId?: string;
  orderId?: string;
  momentId?: string;
}

export interface ReportRow {
  id: string;
  employeeName: string;
  /** Kundens eget nummer på personen, om ett angetts. */
  employeeNumber: string | null;
  orderNumber: string;
  customerName: string | null;
  momentName: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  minutes: number;
  /** true om jobbet pågår just nu — tiden fortsätter alltså räknas upp. */
  ongoing: boolean;
  /** true om posten stängts av systemet och ännu inte granskats. */
  needsReview: boolean;
  /** true om tiden är inskriven för hand av en administratör. */
  manual: boolean;
}

export interface ReportGroup {
  key: string;
  label: string;
  sublabel?: string;
  minutes: number;
  entries: number;
}

export interface ReportResult {
  rows: ReportRow[];
  totalMinutes: number;
  ongoingCount: number;
  needsReviewCount: number;
  byOrder: ReportGroup[];
  byEmployee: ReportGroup[];
  byMoment: ReportGroup[];
}

export async function buildReport(
  db: CompanyDb,
  filters: ReportFilters = {}
): Promise<ReportResult> {
  const entries = await db.timeEntry.findMany({
    where: {
      employeeId: filters.employeeId || undefined,
      orderId: filters.orderId || undefined,
      momentId: filters.momentId || undefined,
      clockInAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    },
    orderBy: { clockInAt: "desc" },
    select: {
      id: true,
      clockInAt: true,
      clockOutAt: true,
      needsReview: true,
      source: true,
      employee: { select: { id: true, name: true, employeeNumber: true } },
      order: { select: { id: true, orderNumber: true, customerName: true } },
      moment: { select: { id: true, name: true } },
    },
  });

  const rows: ReportRow[] = entries.map((entry) => ({
    id: entry.id,
    employeeName: entry.employee.name,
    employeeNumber: entry.employee.employeeNumber,
    orderNumber: entry.order.orderNumber,
    customerName: entry.order.customerName,
    momentName: entry.moment.name,
    clockInAt: entry.clockInAt,
    clockOutAt: entry.clockOutAt,
    minutes: minutesBetween(entry.clockInAt, entry.clockOutAt),
    ongoing: entry.clockOutAt === null,
    needsReview: entry.needsReview,
    manual: entry.source === "ADMIN_MANUAL",
  }));

  return {
    rows,
    totalMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    ongoingCount: rows.filter((row) => row.ongoing).length,
    needsReviewCount: rows.filter((row) => row.needsReview).length,

    byOrder: groupBy(entries, (entry) => ({
      key: entry.order.id,
      label: entry.order.orderNumber,
      sublabel: entry.order.customerName ?? undefined,
    })),
    byEmployee: groupBy(entries, (entry) => ({
      key: entry.employee.id,
      label: entry.employee.name,
      // Numret står som underrubrik i stället för i namnet. Två personer som
      // heter lika går då att skilja åt, utan att numret trängs in i en
      // rubrik där det stör för alla andra.
      sublabel: entry.employee.employeeNumber ?? undefined,
    })),
    byMoment: groupBy(entries, (entry) => ({
      key: entry.moment.id,
      label: entry.moment.name,
    })),
  };
}

type Entry = {
  clockInAt: Date;
  clockOutAt: Date | null;
  employee: { id: string; name: string };
  order: { id: string; orderNumber: string; customerName: string | null };
  moment: { id: string; name: string };
};

function groupBy(
  entries: Entry[],
  pick: (entry: Entry) => { key: string; label: string; sublabel?: string }
): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();

  for (const entry of entries) {
    const { key, label, sublabel } = pick(entry);
    const existing = groups.get(key) ?? {
      key,
      label,
      sublabel,
      minutes: 0,
      entries: 0,
    };

    existing.minutes += minutesBetween(entry.clockInAt, entry.clockOutAt);
    existing.entries += 1;
    groups.set(key, existing);
  }

  // Störst först — det är nästan alltid det man vill se överst i en rapport.
  return [...groups.values()].sort((a, b) => b.minutes - a.minutes);
}
