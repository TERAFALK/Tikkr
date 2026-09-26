import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";
import { describeEntry } from "./entry-label";

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
  /**
   * Kunden rapporten avser.
   *
   * Gick inte att fråga om före kundregistret — kunden var fritext på ordern,
   * och "vad har vi gjort åt Teltek i september" hade inget svar.
   */
  customerId?: string;
  /**
   * Vilken sorts tid rapporten avser. UTELÄMNAS DEN GÄLLER "ORDER".
   *
   * Standardvärdet är inte godtyckligt. Varje anropare som glömmer tänka på
   * improduktiv tid får fakturerbar tid — aldrig tvärtom. Den som vill ha med
   * städtid måste be om det uttryckligen, och skriver då ut ordet i koden.
   *
   * Samma princip som forCompany i tenant.ts bygger på: filtret går inte att
   * glömma, eftersom det inte är något man skriver.
   */
  kind?: "ORDER" | "INDIRECT" | "ALL";
}

export interface ReportRow {
  id: string;
  kind: "ORDER" | "INDIRECT";
  employeeName: string;
  /** Kundens eget nummer på personen, om ett angetts. */
  employeeNumber: string | null;
  /**
   * Vad raden avser: "2601 · Svetsning" eller "Städning". Färdigformaterad av
   * describeEntry, så att ingen vy behöver stava ut skillnaden själv.
   */
  label: string;
  /** Ordernumret. null på improduktiv tid — den hör inte till någon order. */
  orderNumber: string | null;
  customerName: string | null;
  /** Arbetsmomentet, eller det improduktiva momentet. */
  momentName: string;
  /** true när raden ska faktureras. false för improduktiv tid. */
  billable: boolean;
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
  /** Tid som ska faktureras. Summan av raderna med kind ORDER. */
  billableMinutes: number;
  /** Improduktiv tid. Ingår ALDRIG i billableMinutes. */
  indirectMinutes: number;
  byOrder: ReportGroup[];
  /**
   * Per kund. Tom när rapporten bara gäller improduktiv tid — den har ingen
   * order och därmed ingen kund.
   */
  byCustomer: ReportGroup[];
  byEmployee: ReportGroup[];
  byMoment: ReportGroup[];
  /** Per improduktivt moment. Tom när rapporten bara gäller ordertid. */
  byIndirect: ReportGroup[];
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
      // Går genom ordern, eftersom kunden sitter där och inte på stämplingen.
      // Improduktiv tid har ingen order och faller därmed bort av sig själv,
      // vilket är rätt: städning hör inte till en kund.
      order: filters.customerId ? { customerId: filters.customerId } : undefined,
      // Utelämnat filter betyder fakturerbar tid. Se ReportFilters.kind.
      kind: filters.kind === "ALL" ? undefined : (filters.kind ?? "ORDER"),
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
      kind: true,
      employee: { select: { id: true, name: true, employeeNumber: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerId: true,
          customer: { select: { name: true } },
        },
      },
      moment: { select: { id: true, name: true } },
      indirectMoment: { select: { id: true, name: true } },
    },
  });

  const rows: ReportRow[] = entries.map((entry) => {
    const label = describeEntry(entry);

    return {
      id: entry.id,
      kind: entry.kind,
      employeeName: entry.employee.name,
      employeeNumber: entry.employee.employeeNumber,
      label: label.text,
      orderNumber: entry.order?.orderNumber ?? null,
      customerName: label.customerName,
      momentName: entry.moment?.name ?? entry.indirectMoment?.name ?? "",
      billable: label.billable,
      clockInAt: entry.clockInAt,
      clockOutAt: entry.clockOutAt,
      minutes: minutesBetween(entry.clockInAt, entry.clockOutAt),
      ongoing: entry.clockOutAt === null,
      needsReview: entry.needsReview,
      manual: entry.source === "ADMIN_MANUAL",
    };
  });

  // Grupperingarna per order och per arbetsmoment får ALDRIG se improduktiv
  // tid. Utan den här uppdelningen hade en Map-nyckel blivit undefined och
  // gett en tyst skräpgrupp mitt i ett fakturaunderlag.
  const billable = entries.filter((entry) => entry.kind === "ORDER");
  const indirect = entries.filter((entry) => entry.kind === "INDIRECT");

  return {
    rows,
    totalMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    billableMinutes: rows
      .filter((row) => row.billable)
      .reduce((sum, row) => sum + row.minutes, 0),
    indirectMinutes: rows
      .filter((row) => !row.billable)
      .reduce((sum, row) => sum + row.minutes, 0),
    ongoingCount: rows.filter((row) => row.ongoing).length,
    needsReviewCount: rows.filter((row) => row.needsReview).length,

    byOrder: groupBy(billable, (entry) => ({
      key: entry.order?.id ?? "",
      label: entry.order?.orderNumber ?? "",
      sublabel: entry.order?.customer?.name ?? undefined,
    })),
    // Ordrar UTAN kund utelämnas, i stället för att samlas i en grupp med tom
    // rubrik. En sådan grupp ser ut som ett fel i en rapport, och tiden finns
    // kvar i totalen och i byOrder — den har inte försvunnit, den hör bara
    // inte till någon kund än.
    byCustomer: groupBy(
      billable.filter((entry) => entry.order?.customerId),
      (entry) => ({
        key: entry.order?.customerId ?? "",
        label: entry.order?.customer?.name ?? "",
      })
    ),
    byEmployee: groupBy(entries, (entry) => ({
      key: entry.employee.id,
      label: entry.employee.name,
      // Numret står som underrubrik i stället för i namnet. Två personer som
      // heter lika går då att skilja åt, utan att numret trängs in i en
      // rubrik där det stör för alla andra.
      sublabel: entry.employee.employeeNumber ?? undefined,
    })),
    byMoment: groupBy(billable, (entry) => ({
      key: entry.moment?.id ?? "",
      label: entry.moment?.name ?? "",
    })),
    byIndirect: groupBy(indirect, (entry) => ({
      key: entry.indirectMoment?.id ?? "",
      label: entry.indirectMoment?.name ?? "",
    })),
  };
}

type Entry = {
  clockInAt: Date;
  clockOutAt: Date | null;
  employee: { id: string; name: string; employeeNumber: string | null };
  // Nullbara: en improduktiv post har varken order eller arbetsmoment, och en
  // orderpost har inget improduktivt moment. Anroparen filtrerar på kind INNAN
  // den grupperar, så att en nyckel aldrig blir tom.
  order: {
    id: string;
    orderNumber: string;
    customerId: string | null;
    customer: { name: string } | null;
  } | null;
  moment: { id: string; name: string } | null;
  indirectMoment: { id: string; name: string } | null;
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
