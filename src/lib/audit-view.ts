import type { AuditEvent } from "@prisma/client";
import type { CompanyDb } from "./tenant";
import { formatDate, formatDateTime, formatDuration, formatSignedDuration } from "./format";
import { formatCurrency, formatMarkup } from "./money";

/**
 * ÄNDRINGSLOGGEN SOM TEXT.
 *
 * Loggen sparar id:n och råa värden, med flit: ett ordernummer som ändras
 * senare ska inte skriva om historiken. Den här filen översätter till det en
 * administratör läser — namn i stället för id, tim:min i stället för minuter,
 * datum i företagets tidszon.
 *
 * Namnen slås upp när loggen visas och inte när den skrivs. En anonymiserad
 * person står därför som "Anonymiserad anställd" även i gamla rader, vilket
 * är hela poängen med en anonymisering.
 */

const ENTITY_LABELS: Record<string, string> = {
  TimeEntry: "Stämpling",
  Absence: "Frånvaro",
  CompAdjustment: "Komptid",
  Employee: "Anställd",
  AdminUser: "Administratör",
  Company: "Företaget",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Inlagd",
  update: "Ändrad",
  delete: "Borttagen",
  review: "Granskad och godkänd",
  "auto-close": "Automatiskt utstämplad",
  "close-order": "Utstämplad när ordern avslutades",
  anonymize: "Anonymiserad",
};

const FIELD_LABELS: Record<string, string> = {
  kind: "Sort",
  employeeId: "Anställd",
  orderId: "Order",
  momentId: "Arbetsmoment",
  indirectMomentId: "Improduktivt moment",
  clockInAt: "Instämplad",
  clockOutAt: "Utstämplad",
  source: "Källa",
  needsReview: "Ogranskad",
  momentCostRateOre: "Arbetsmomentets timkostnad",
  employeeCostRateOre: "Personens timkostnad",
  costRateOre: "Timkostnad",
  active: "Aktiv",
  flexOpeningMinutes: "Ingående flexsaldo",
  compOpeningMinutes: "Ingående komptid",
  balanceOpeningDate: "Saldon räknas från",
  date: "Datum",
  reasonId: "Orsak",
  minutes: "Tid",
  note: "Anteckning",
  email: "E-postadress",
  twoStep: "Tvåstegsinloggning",
  role: "Behörighet",
  markupPercent: "Påslag",
  autoCloseAt: "Automatisk utstämpling",
  timezone: "Tidszon",
};

const SOURCE_LABELS: Record<string, string> = {
  KIOSK: "Stämplingsskärm",
  KIOSK_OFFLINE_SYNC: "Stämplingsskärm, skickad senare",
  ADMIN_MANUAL: "Inskriven av administratör",
  AUTO_CLOSE: "Automatisk utstämpling",
};

export interface AuditChange {
  label: string;
  before: string;
  after: string;
}

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  what: string;
  /** Den anställde ändringen gäller, när det finns en. */
  subject: string | null;
  changes: AuditChange[];
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

/**
 * Översätter en sida ur loggen.
 *
 * Alla id:n slås upp i en fråga per sort, inte en per rad. En sida med femtio
 * rader hade annars blivit hundratals frågor.
 */
export async function describeAuditEvents(
  db: CompanyDb,
  events: AuditEvent[],
  timeZone: string
): Promise<AuditRow[]> {
  const ids = {
    employee: new Set<string>(),
    order: new Set<string>(),
    moment: new Set<string>(),
    indirect: new Set<string>(),
    reason: new Set<string>(),
  };

  for (const event of events) {
    if (event.subjectEmployeeId) ids.employee.add(event.subjectEmployeeId);
    for (const side of [asObject(event.before), asObject(event.after)]) {
      if (typeof side.employeeId === "string") ids.employee.add(side.employeeId);
      if (typeof side.orderId === "string") ids.order.add(side.orderId);
      if (typeof side.momentId === "string") ids.moment.add(side.momentId);
      if (typeof side.indirectMomentId === "string") {
        ids.indirect.add(side.indirectMomentId);
      }
      if (typeof side.reasonId === "string") ids.reason.add(side.reasonId);
    }
  }

  const [employees, orders, moments, indirects, reasons] = await Promise.all([
    db.employee.findMany({
      where: { id: { in: [...ids.employee] } },
      select: { id: true, name: true },
    }),
    db.order.findMany({
      where: { id: { in: [...ids.order] } },
      select: { id: true, orderNumber: true },
    }),
    db.workMoment.findMany({
      where: { id: { in: [...ids.moment] } },
      select: { id: true, name: true },
    }),
    db.indirectMoment.findMany({
      where: { id: { in: [...ids.indirect] } },
      select: { id: true, name: true },
    }),
    db.absenceReason.findMany({
      where: { id: { in: [...ids.reason] } },
      select: { id: true, name: true },
    }),
  ]);

  const names = {
    employeeId: new Map(employees.map((row) => [row.id, row.name])),
    orderId: new Map(orders.map((row) => [row.id, row.orderNumber])),
    momentId: new Map(moments.map((row) => [row.id, row.name])),
    indirectMomentId: new Map(indirects.map((row) => [row.id, row.name])),
    reasonId: new Map(reasons.map((row) => [row.id, row.name])),
  } as Record<string, Map<string, string>>;

  function show(key: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";

    const lookup = names[key];
    if (lookup && typeof value === "string") return lookup.get(value) ?? "Borttagen";

    switch (key) {
      case "clockInAt":
      case "clockOutAt":
        return formatDateTime(new Date(String(value)), timeZone);
      case "date":
      case "balanceOpeningDate":
        return formatDate(new Date(String(value)), timeZone);
      case "minutes":
        return typeof value === "number" ? formatSignedOrPlain(value) : "—";
      case "flexOpeningMinutes":
      case "compOpeningMinutes":
        return typeof value === "number" ? formatSignedDuration(value) : "—";
      case "momentCostRateOre":
      case "employeeCostRateOre":
      case "costRateOre":
        return typeof value === "number" ? `${formatCurrency(value)}/tim` : "—";
      case "markupPercent":
        return typeof value === "number" ? formatMarkup(value) : "—";
      case "source":
        return SOURCE_LABELS[String(value)] ?? String(value);
      case "kind":
        return value === "INDIRECT" ? "Improduktiv tid" : "Ordertid";
      case "role":
        return value === "OWNER" ? "Ägare" : "Administratör";
      case "needsReview":
      case "active":
        return value ? "Ja" : "Nej";
      default:
        return String(value);
    }
  }

  return events.map((event) => {
    const before = asObject(event.before);
    const after = asObject(event.after);

    // Bara det som skiljer sig. En ändring av sluttiden ska inte visa tio
    // oförändrade fält runt omkring.
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .filter((key) => FIELD_LABELS[key]);

    const subject = event.subjectEmployeeId
      ? (names.employeeId.get(event.subjectEmployeeId) ?? "Borttagen")
      : null;

    return {
      id: event.id,
      at: formatDateTime(event.createdAt, timeZone),
      actor:
        event.actorEmail === "system"
          ? "Tikkr"
          : event.actorEmail === "kiosk"
            ? "Stämplingsskärmen"
            : event.actorEmail,
      what: `${ENTITY_LABELS[event.entity] ?? event.entity}: ${(
        ACTION_LABELS[event.action] ?? event.action
      ).toLowerCase()}`,
      subject,
      changes: keys.map((key) => ({
        label: FIELD_LABELS[key],
        before: event.before === null ? "—" : show(key, before[key]),
        after: event.after === null ? "—" : show(key, after[key]),
      })),
    };
  });
}

/** Komptid är plus eller minus och skrivs med tecken; frånvaro utan. */
function formatSignedOrPlain(minutes: number): string {
  return minutes < 0 ? formatSignedDuration(minutes) : formatDuration(minutes);
}
