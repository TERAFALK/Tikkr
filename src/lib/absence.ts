import type { AbsenceType } from "@prisma/client";
import type { CompanyDb } from "./tenant";
import { plannedMinutesForDay, isoWeekdayIn, schedulesForEmployees } from "./schedule";

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

/** Frånvarotyperna i den ordning de visas, med svensk etikett. */
export const ABSENCE_LABELS: Record<AbsenceType, string> = {
  SJUK: "Sjuk",
  VAB: "Vård av barn",
  SEMESTER: "Semester",
  FORALDRALEDIG: "Föräldraledig",
  TJANSTLEDIG: "Tjänstledig",
  PERMISSION: "Permission",
  KOMP_UTTAG: "Uttagen komp",
  OVRIGT: "Övrigt",
};

export const ABSENCE_ORDER: AbsenceType[] = [
  "SJUK",
  "VAB",
  "SEMESTER",
  "FORALDRALEDIG",
  "TJANSTLEDIG",
  "PERMISSION",
  "KOMP_UTTAG",
  "OVRIGT",
];

export interface MarkAbsenceInput {
  employeeId: string;
  /** Dagen, vid dygnets början i företagets tidszon. */
  date: Date;
  type: AbsenceType;
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
 * KOMP_UTTAG skriver dessutom en rad i komptidsboken, så att saldot minskar.
 * Raderna hänger ihop via `absenceId`, vilket gör att en borttagen frånvaro
 * städar bort sitt eget uttag i stället för att lämna kvar ett avdrag för en
 * ledighet som aldrig blev av.
 */
export async function markAbsence(
  db: CompanyDb,
  companyId: string,
  timeZone: string,
  input: MarkAbsenceInput
): Promise<void> {
  const employee = await db.employee.findFirst({
    where: { id: input.employeeId },
    select: { id: true },
  });

  if (!employee) throw new AbsenceError("Okänd anställd.");

  if (input.minutes !== null && input.minutes !== undefined) {
    if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
      throw new AbsenceError("Antalet timmar måste vara större än noll.");
    }
    if (input.minutes > 24 * 60) {
      throw new AbsenceError("En frånvarodag kan inte vara längre än ett dygn.");
    }
  }

  const absence = await db.absence.upsert({
    where: {
      employeeId_date_type: {
        employeeId: input.employeeId,
        date: input.date,
        type: input.type,
      },
    },
    create: {
      companyId,
      employeeId: input.employeeId,
      date: input.date,
      type: input.type,
      minutes: input.minutes ?? null,
      note: input.note?.trim() || null,
      createdByEmail: input.byEmail,
    },
    update: {
      minutes: input.minutes ?? null,
      note: input.note?.trim() || null,
    },
  });

  if (input.type !== "KOMP_UTTAG") return;

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
  absenceId: string
): Promise<void> {
  // deleteMany och inte delete: id:t kommer från ett formulär och får aldrig
  // kunna peka på en annan kunds post. Företagsfiltret ger då noll rader.
  await db.compAdjustment.deleteMany({ where: { absenceId } });
  await db.absence.deleteMany({ where: { id: absenceId } });
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

  await db.compAdjustment.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      date: input.date,
      minutes: Math.round(input.minutes),
      note: input.note?.trim() || null,
      createdByEmail: input.byEmail,
    },
  });
}

/** Tar bort en komprad. Uttag som hör till en frånvaro tas bort med frånvaron. */
export async function removeCompAdjustment(
  db: CompanyDb,
  id: string
): Promise<void> {
  await db.compAdjustment.deleteMany({ where: { id, absenceId: null } });
}
