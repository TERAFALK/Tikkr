import type { CompanyDb } from "./tenant";
import { plannedMinutesForDay, isoWeekdayIn, schedulesForEmployees } from "./schedule";
import { recordAudit } from "./audit";

/**
 * FRÅNVARO — SJUKDOM, VAB, SEMESTER OCH UTTAGEN KOMP.
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
 * på en sådan orsak skriver samtidigt ett uttag i komptidsboken. Utan den
 * kopplingen skulle en uttagen komptimme räknas två gånger.
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
  { name: "Uttagen komp", countsAsComp: true },
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
 * En orsak märkt `countsAsComp` skriver dessutom en rad i komptidsboken, så
 * att saldot minskar. Raderna hänger ihop via `absenceId`, vilket gör att en
 * borttagen frånvaro städar bort sitt eget uttag i stället för att lämna kvar
 * ett avdrag för en ledighet som aldrig blev av.
 */
export async function markAbsence(
  db: CompanyDb,
  companyId: string,
  timeZone: string,
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
      select: { id: true, countsAsComp: true },
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

  if (!reason.countsAsComp) return;

  // Uttaget ska motsvara de timmar personen faktiskt är ledig. Är inget antal
  // angivet gäller hela den schemalagda dagen, samma siffra som frånvaron
  // täcker.
  const minutes =
    input.minutes ??
    (await plannedMinutesFor(db, input.employeeId, input.date, timeZone));

  await db.compAdjustment.upsert({
    where: { absenceId: absence.id },
    create: {
      companyId,
      employeeId: input.employeeId,
      date: input.date,
      minutes: -minutes,
      note: "Uttagen komp",
      createdByEmail: input.byEmail,
      absenceId: absence.id,
    },
    update: { minutes: -minutes },
  });
}

/** Tar bort en frånvaropost, och uttaget som hörde till den. */
export async function removeAbsence(
  db: CompanyDb,
  absenceId: string,
  byEmail: string
): Promise<void> {
  // Uppslaget går genom företagsfiltret: id:t kommer från ett formulär och
  // får aldrig kunna peka på en annan kunds post.
  const absence = await db.absence.findFirst({ where: { id: absenceId } });
  if (!absence) return;

  await db.compAdjustment.deleteMany({ where: { absenceId } });
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

/** Planerad tid för en anställd en viss dag, i minuter. */
export async function plannedMinutesFor(
  db: CompanyDb,
  employeeId: string,
  date: Date,
  timeZone: string
): Promise<number> {
  const schedules = await schedulesForEmployees(db, [employeeId]);
  return plannedMinutesForDay(
    schedules.get(employeeId) ?? null,
    isoWeekdayIn(date, timeZone)
  );
}

export interface CompEntryInput {
  employeeId: string;
  date: Date;
  minutes: number;
  note?: string | null;
  byEmail: string;
}

/**
 * Skriver in intjänad komptid — godkänd övertid.
 *
 * Uppstår ALDRIG av sig själv. Tid utöver schemat är flex till dess att någon
 * beslutat att den är övertid, och det beslutet fattas av en människa och inte
 * av en stämplingsklocka. Den timmen flyttas då ur flexsaldot och in i
 * komptidsboken; se flexformeln i payroll.ts.
 */
export async function addCompEarned(
  db: CompanyDb,
  companyId: string,
  input: CompEntryInput
): Promise<void> {
  if (!Number.isFinite(input.minutes) || input.minutes === 0) {
    throw new AbsenceError("Ange ett antal timmar skilt från noll.");
  }

  const employee = await db.employee.findFirst({
    where: { id: input.employeeId },
    select: { id: true },
  });

  if (!employee) throw new AbsenceError("Okänd anställd.");

  const created = await db.compAdjustment.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      date: input.date,
      minutes: Math.round(input.minutes),
      note: input.note?.trim() || null,
      createdByEmail: input.byEmail,
    },
  });

  await recordAudit(db, {
    companyId,
    actorEmail: input.byEmail,
    entity: "CompAdjustment",
    entityId: created.id,
    action: "create",
    after: compSnapshot(created),
    subjectEmployeeId: input.employeeId,
  });
}

function compSnapshot(row: {
  employeeId: string;
  date: Date;
  minutes: number;
  note: string | null;
}): Record<string, unknown> {
  return {
    employeeId: row.employeeId,
    date: row.date.toISOString(),
    minutes: row.minutes,
    note: row.note,
  };
}

/** Tar bort en komprad. Uttag som hör till en frånvaro tas bort med frånvaron. */
export async function removeCompAdjustment(
  db: CompanyDb,
  id: string,
  byEmail: string
): Promise<void> {
  const row = await db.compAdjustment.findFirst({
    where: { id, absenceId: null },
  });
  if (!row) return;

  await db.compAdjustment.deleteMany({ where: { id, absenceId: null } });

  await recordAudit(db, {
    companyId: db.$companyId,
    actorEmail: byEmail,
    entity: "CompAdjustment",
    entityId: id,
    action: "delete",
    before: compSnapshot(row),
    subjectEmployeeId: row.employeeId,
  });
}
