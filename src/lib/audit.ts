import type { Prisma, TimeEntry } from "@prisma/client";
import type { CompanyDb } from "./tenant";

/**
 * ÄNDRINGSLOGGEN.
 *
 * Varje ändring av något som är underlag för en faktura eller en lön skrivs
 * hit, med värdet före och efter. Se AuditEvent i schemat för varför, och
 * vad som medvetet INTE skrivs hit.
 *
 * Neutral fil: läses både av stämplingen (clock.ts) och av löneunderlaget
 * (absence.ts). Den importerar därför ingenting från någondera sidan, på samma
 * sätt som modules.ts och brand.ts.
 *
 * SKRIVS I SAMMA TRANSAKTION SOM ÄNDRINGEN där det går. En ändring utan rad
 * här är precis det loggen finns för att förhindra; en rad utan ändring är
 * nästan lika illa, eftersom den påstår något som inte hände.
 */

/** Den som gjorde ändringen när ingen människa gjorde den. */
export const SYSTEM_ACTOR = "system";

/**
 * När ändringen kom från ett tryck på stämplingsskärmen. Skärmen vet inte vem
 * som stod vid den, bara vilken anställd trycket gällde, och den står i
 * `subjectEmployeeId`.
 */
export const KIOSK_ACTOR = "kiosk";

export type AuditEntity =
  | "TimeEntry"
  | "Absence"
  | "CompAdjustment"
  | "Employee"
  | "AdminUser"
  | "Company";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "review"
  | "auto-close"
  | "close-order"
  | "anonymize";

/**
 * Klienten loggen skrivs genom. Både den företagslåsta klienten och en
 * transaktion ur den duger — båda filtrerar på företaget.
 */
type AuditClient = Pick<CompanyDb, "auditEvent">;

export interface AuditInput {
  companyId: string;
  actorEmail: string;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  subjectEmployeeId?: string | null;
}

export async function recordAudit(
  db: AuditClient,
  input: AuditInput
): Promise<void> {
  await db.auditEvent.create({
    data: {
      companyId: input.companyId,
      actorEmail: input.actorEmail,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      before: toJson(input.before),
      after: toJson(input.after),
      subjectEmployeeId: input.subjectEmployeeId ?? null,
    },
  });
}

/**
 * Det som betyder något för underlaget i en stämpling.
 *
 * Satserna står med: en ändring av person eller moment byter dem, och det är
 * just den sortens ändring som behöver gå att förklara i efterhand.
 */
export function timeEntrySnapshot(
  entry: Pick<
    TimeEntry,
    | "kind"
    | "employeeId"
    | "orderId"
    | "momentId"
    | "indirectMomentId"
    | "clockInAt"
    | "clockOutAt"
    | "source"
    | "needsReview"
    | "momentCostRateOre"
    | "employeeCostRateOre"
  >
): Record<string, unknown> {
  return {
    kind: entry.kind,
    employeeId: entry.employeeId,
    orderId: entry.orderId,
    momentId: entry.momentId,
    indirectMomentId: entry.indirectMomentId,
    clockInAt: entry.clockInAt.toISOString(),
    clockOutAt: entry.clockOutAt?.toISOString() ?? null,
    source: entry.source,
    needsReview: entry.needsReview,
    momentCostRateOre: entry.momentCostRateOre,
    employeeCostRateOre: entry.employeeCostRateOre,
  };
}

/**
 * Det som betyder något för underlagen hos en anställd.
 *
 * ALDRIG namn, nummer eller foto. Loggen ska överleva en anonymisering, och
 * den gör det bara om den aldrig bar det anonymiseringen tar bort.
 */
export function employeeSnapshot(employee: {
  active: boolean;
  costRateOre: number | null;
  flexOpeningMinutes: number;
  compOpeningMinutes: number;
  balanceOpeningDate: Date | null;
}): Record<string, unknown> {
  return {
    active: employee.active,
    costRateOre: employee.costRateOre,
    flexOpeningMinutes: employee.flexOpeningMinutes,
    compOpeningMinutes: employee.compOpeningMinutes,
    balanceOpeningDate: employee.balanceOpeningDate?.toISOString() ?? null,
  };
}

/** De fält ur ögonblicksbilden som skiljer sig. Tomt när inget ändrats. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const keys = Object.keys(after).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );
  if (keys.length === 0) return null;

  return {
    before: Object.fromEntries(keys.map((key) => [key, before[key]])),
    after: Object.fromEntries(keys.map((key) => [key, after[key]])),
  };
}

/**
 * Loggar en ändring av en anställd, om något som betyder något ändrades.
 *
 * Läser personen före och efter i stället för att lita på formuläret: det
 * som står i databasen efteråt är det som gäller, oavsett vad som skickades.
 */
export async function auditEmployeeChange(
  db: CompanyDb,
  params: {
    employeeId: string;
    actorEmail: string;
    before: Record<string, unknown>;
  }
): Promise<void> {
  const after = await db.employee.findFirst({
    where: { id: params.employeeId },
    select: EMPLOYEE_AUDIT_FIELDS,
  });
  if (!after) return;

  const diff = changedFields(params.before, employeeSnapshot(after));
  if (!diff) return;

  await recordAudit(db, {
    companyId: db.$companyId,
    actorEmail: params.actorEmail,
    entity: "Employee",
    entityId: params.employeeId,
    action: "update",
    before: diff.before,
    after: diff.after,
    subjectEmployeeId: params.employeeId,
  });
}

/** Urvalet som employeeSnapshot behöver. */
export const EMPLOYEE_AUDIT_FIELDS = {
  active: true,
  costRateOre: true,
  flexOpeningMinutes: true,
  compOpeningMinutes: true,
  balanceOpeningDate: true,
} as const;

/** Personens fält före en ändring, för auditEmployeeChange. */
export async function employeeBefore(
  db: CompanyDb,
  employeeId: string
): Promise<Record<string, unknown> | null> {
  const row = await db.employee.findFirst({
    where: { id: employeeId },
    select: EMPLOYEE_AUDIT_FIELDS,
  });
  return row ? employeeSnapshot(row) : null;
}

/**
 * Till JSON som Prisma tar emot. Utelämnat fält lämnar kolumnen tom.
 *
 * Datum blir text och odefinierat försvinner — samma form som läses tillbaka,
 * så att det som visas i loggen är exakt det som sparades.
 */
function toJson(
  value: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
