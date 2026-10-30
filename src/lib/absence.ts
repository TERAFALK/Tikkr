import type { CompanyDb } from "./tenant";
import { recordAudit } from "./audit";

/**
 * FRÅNVARO — SJUKDOM, VAB, SEMESTER OCH FLEXLEDIGHET.
 *
 * Frånvaron TÄCKER den planerade tiden. Det är hela poängen: en sjukdag ska ge
 * noll i flex, inte minus 8,5 timmar. Utan frånvaroregistrering skulle den som
 * är sjuk en vecka komma tillbaka till ett flexsaldo på minus fyrtio, och
 * systemet vore obrukbart för lön.
 *
 * TIKKR RÄKNAR TIMMAR, ALDRIG KRONOR. Vad en sjukdag är värd i lön — karensdag,
 * sjuklön, karensavdrag — avgörs av kollektivavtalet i lönesystemet. Här
 * redovisas bara hur många timmar personen var borta och av vilket skäl.
 *
 * REGISTRERAS AV ADMINISTRATÖREN, aldrig av kiosken. En stämplingsskärm i
 * verkstaden är fel plats att uppge varför man är borta; det är en uppgift om
 * hälsa och familj, och den hör till kontoret.
 */

export class AbsenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbsenceError";
  }
}

/**
 * ORSAKERNA ÄR KUNDENS EGNA (ändrat 2026-10-01).
 *
 * De låg som en enum i koden: sjuk, vab, semester och fem till. Det höll
 * tills första kunden hade en orsak vi inte tänkt på, och en ny rad i en enum
 * kräver en driftsättning. Orsakerna hör till kundens verksamhet.
 *
 * Listan nedan är vad en ny arbetsyta får att börja med, inte vad som finns.
 * Den som vill ha "arbetsskada" lägger till den själv under Inställningar.
 *
 * `countsAsComp` är den enda raden som betyder något för räkningen: frånvaro
 * på en sådan orsak DRAR PÅ FLEXEN i stället för att täcka den planerade
 * tiden. Den som är flexledig tar ut timmar hen arbetat in. Kolumnen heter
 * fortfarande comp, efter komptiden som fanns till 2026-10-13; ett namnbyte
 * kräver en migration i två steg och ändrar ingenting kunden ser.
 */
export const DEFAULT_ABSENCE_REASONS: {
  name: string;
  countsAsComp?: boolean;
}[] = [
  { name: "Sjuk" },
  { name: "Vård av barn" },
  { name: "Semester" },
  { name: "Föräldraledig" },
  { name: "Tjänstledig" },
  { name: "Permission" },
  { name: "Flexledig", countsAsComp: true },
  { name: "Övrigt" },
];

/**
 * Lägger upp standardorsakerna.
 *
 * Anropas när en arbetsyta skapas, och från inställningarna för den kund som
 * börjat utan dem. Skriver ingenting om det redan finns orsaker: listan är
 * kundens, och en "återställning" som dyker upp av sig själv vore en
 * överraskning.
 */
export async function createDefaultAbsenceReasons(
  db: CompanyDb,
  companyId: string
): Promise<number> {
  const existing = await db.absenceReason.count();
  if (existing > 0) return 0;

  await db.absenceReason.createMany({
    data: DEFAULT_ABSENCE_REASONS.map((reason, index) => ({
      companyId,
      name: reason.name,
      countsAsComp: reason.countsAsComp ?? false,
      sortOrder: index,
    })),
  });

  return DEFAULT_ABSENCE_REASONS.length;
}

export interface MarkAbsenceInput {
  employeeId: string;
  /** Dagen, vid dygnets början i företagets tidszon. */
  date: Date;
  /** Orsaken, ur kundens egen lista. */
  reasonId: string;
  /** Tomt betyder hela den schemalagda dagen. */
  minutes?: number | null;
  note?: string | null;
  byEmail: string;
}

/**
 * Registrerar frånvaro för en dag.
 *
 * Samma person, dag och typ två gånger uppdaterar posten i stället för att
 * lägga till en till — det är nästan alltid en rättelse. Två OLIKA typer samma
 * dag är däremot tillåtet: halva dagen semester och halva VAB är ett verkligt
 * fall.
 *
 * En orsak märkt `countsAsComp` drar på flexen. Det räknas fram i payroll.ts
 * ur orsaken, och ingen rad skrivs någon annanstans: en borttagen frånvaro tar
 * då med sig avdraget av sig själv.
 */
export async function markAbsence(
  db: CompanyDb,
  companyId: string,
  input: MarkAbsenceInput
): Promise<void> {
  const [employee, reason] = await Promise.all([
    db.employee.findFirst({
      where: { id: input.employeeId },
      select: { id: true },
    }),
    // Slås upp genom det filtrerade lagret i stället för att lita på id:t.
    // Det kommer från ett formulär och får aldrig peka på en annan kunds
    // orsak. En avaktiverad orsak går inte heller att registrera ny frånvaro
    // på — den finns kvar för att gamla poster ska gå att läsa.
    db.absenceReason.findFirst({
      where: { id: input.reasonId, active: true },
      select: { id: true },
    }),
  ]);

  if (!employee) throw new AbsenceError("Okänd anställd.");
  if (!reason) throw new AbsenceError("Välj en frånvaroorsak.");

  if (input.minutes !== null && input.minutes !== undefined) {
    if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
      throw new AbsenceError("Antalet timmar måste vara större än noll.");
    }
    if (input.minutes > 24 * 60) {
      throw new AbsenceError("En frånvarodag kan inte vara längre än ett dygn.");
    }
  }

  const existing = await db.absence.findFirst({
    where: { employeeId: input.employeeId, date: input.date, reasonId: reason.id },
  });

  const absence = await db.absence.upsert({
    where: {
      employeeId_date_reasonId: {
        employeeId: input.employeeId,
        date: input.date,
        reasonId: reason.id,
      },
    },
    create: {
      companyId,
      employeeId: input.employeeId,
      date: input.date,
      reasonId: reason.id,
      minutes: input.minutes ?? null,
      note: input.note?.trim() || null,
      createdByEmail: input.byEmail,
    },
    update: {
      minutes: input.minutes ?? null,
      note: input.note?.trim() || null,
    },
  });

  await recordAudit(db, {
    companyId,
    actorEmail: input.byEmail,
    entity: "Absence",
    entityId: absence.id,
    action: existing ? "update" : "create",
    before: existing ? absenceSnapshot(existing) : null,
    after: absenceSnapshot(absence),
    subjectEmployeeId: input.employeeId,
  });
}

/** Tar bort en frånvaropost. */
export async function removeAbsence(
  db: CompanyDb,
  absenceId: string,
  byEmail: string
): Promise<void> {
  // Uppslaget går genom företagsfiltret: id:t kommer från ett formulär och
  // får aldrig kunna peka på en annan kunds post.
  const absence = await db.absence.findFirst({ where: { id: absenceId } });
  if (!absence) return;

  await db.absence.deleteMany({ where: { id: absenceId } });

  await recordAudit(db, {
    companyId: db.$companyId,
    actorEmail: byEmail,
    entity: "Absence",
    entityId: absenceId,
    action: "delete",
    before: absenceSnapshot(absence),
    subjectEmployeeId: absence.employeeId,
  });
}

/**
 * Det som betyder något för tidrapporten i en frånvaropost.
 *
 * Anteckningen står med, trots att den kan säga något om hälsa: den är en
 * del av vad som ändrades. Raderna försvinner med personens frånvaro vid en
 * anonymisering, se anonymizeEmployee.
 */
function absenceSnapshot(absence: {
  employeeId: string;
  date: Date;
  reasonId: string;
  minutes: number | null;
  note: string | null;
}): Record<string, unknown> {
  return {
    employeeId: absence.employeeId,
    date: absence.date.toISOString(),
    reasonId: absence.reasonId,
    minutes: absence.minutes,
    note: absence.note,
  };
}
