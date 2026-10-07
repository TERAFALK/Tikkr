"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  AbsenceError,
  addCompEarned,
  markAbsence,
  removeAbsence,
  removeCompAdjustment,
} from "@/lib/absence";
import { currentFlexMinutes } from "@/lib/payroll";
import { parseLocalDate } from "@/lib/time-zone";
import { auditEmployeeChange, employeeBefore } from "@/lib/audit";

const PATH = "/admin/tidrapport";

export interface TimesheetState {
  error?: string;
  savedAt?: number;
}

/** Företagets tidszon. Dygnsgränser räknas alltid på väggen. */
async function timeZoneOf(companyId: string): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  return company?.timezone ?? "Europe/Stockholm";
}

/**
 * Läser frånvarons timfält och ger minuter.
 *
 * Tomt betyder hela den schemalagda dagen, vilket är det vanliga fallet — en
 * sjukdag är en hel dag. Bara ett ifyllt men obegripligt värde är ett fel.
 *
 * GÅR GENOM SAMMA TOLKNING SOM ALLA ANDRA TIDFÄLT. Fältet läste förut bara
 * decimaltimmar medan skärmen visar tim:min, och det blev fel varje gång
 * någon skrev av det hen såg: ett flexsaldo på −1:44 som skulle täckas av
 * frånvaro gav 1,44 timmar, alltså en timme och 26 minuter, och arton
 * minuter blev kvar som minus. Se CLAUDE.md § 7.1 punkt 8.
 */
function parseAbsenceHours(
  raw: FormDataEntryValue | null
): number | null | "error" {
  const minutes = hoursInputToMinutes(raw);

  // Noll och minus är inte en frånvaro. Tomt är det däremot: då gäller hela
  // den schemalagda dagen.
  if (minutes !== null && minutes !== "error" && minutes <= 0) return "error";

  return minutes;
}

export async function saveAbsence(
  _previous: TimesheetState,
  formData: FormData
): Promise<TimesheetState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId, email } = session;

  const employeeId = String(formData.get("employeeId") ?? "");
  const reasonId = String(formData.get("reasonId") ?? "");
  const rawFrom = String(formData.get("from") ?? "");
  const rawTo = String(formData.get("to") ?? "").trim();

  if (!employeeId) return { error: "Ingen anställd vald." };
  if (!reasonId) return { error: "Välj en frånvaroorsak." };

  const timeZone = await timeZoneOf(companyId);

  const from = parseLocalDate(rawFrom, timeZone);
  if (!from) return { error: "Ange ett datum." };

  // Tomt slutdatum betyder en enda dag. En sjukanmälan gäller oftast i dag.
  const to = rawTo ? parseLocalDate(rawTo, timeZone) : from;
  if (!to) return { error: "Slutdatumet går inte att läsa." };
  if (to < from) return { error: "Slutdatumet ligger före startdatumet." };

  const minutes = parseAbsenceHours(formData.get("hours"));
  if (minutes === "error") {
    return { error: "Skriv tiden som 4:00 eller 3,5." };
  }

  // En period skrivs som en post per dag. Det gör att en enskild dag går att
  // rätta eller ta bort utan att hela sjukperioden måste läggas om.
  const { daysInPeriod } = await import("@/lib/schedule");

  try {
    for (const date of daysInPeriod(from, to, timeZone)) {
      await markAbsence(db, companyId, timeZone, {
        employeeId,
        date,
        reasonId,
        minutes,
        note: String(formData.get("note") ?? ""),
        byEmail: email,
      });
    }
  } catch (error) {
    if (error instanceof AbsenceError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

export async function deleteAbsence(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await removeAbsence(session.db, id, session.email);
  revalidatePath(PATH);
}

export async function saveCompEarned(
  _previous: TimesheetState,
  formData: FormData
): Promise<TimesheetState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId, email } = session;

  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Ingen anställd vald." };

  const timeZone = await timeZoneOf(companyId);
  const date = parseLocalDate(String(formData.get("date") ?? ""), timeZone);
  if (!date) return { error: "Ange ett datum." };

  // Samma tolkning som frånvaron: godkänd komptid skrivs av från ett saldo
  // som står i tim:min.
  const minutes = parseAbsenceHours(formData.get("hours"));
  if (minutes === "error" || minutes === null) {
    return { error: "Skriv tiden som 2:00 eller 2,5." };
  }

  try {
    await addCompEarned(db, companyId, {
      employeeId,
      date,
      minutes,
      note: String(formData.get("note") ?? ""),
      byEmail: email,
    });
  } catch (error) {
    if (error instanceof AbsenceError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

export async function deleteCompEarned(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await removeCompAdjustment(session.db, id, session.email);
  revalidatePath(PATH);
}


/** Svaret från rutan som ändrar saldot. ActionDialog stänger på `ok`. */
export interface BalanceState {
  error?: string;
  ok?: string;
}

/**
 * ÄNDRAR FLEXSALDOT FÖR HAND.
 *
 * Administratören skriver vad saldot SKA vara idag. Servern räknar ut hur
 * mycket det skiljer sig från det framräknade och lägger skillnaden på det
 * ingående saldot.
 *
 * Varför inte spara saldot rakt av: saldon lagras aldrig i Tikkr, de härleds
 * ur stämplingar, frånvaro och schema (se CLAUDE.md § 3 regel 7). Ett sparat
 * saldo och en uppsättning poster är två ställen som säger samma sak, och de
 * hinner alltid sluta göra det. Det ingående saldot är den enda siffran som
 * hör till personen och inte till en dag, och därför den som ska flyttas.
 *
 * Nuvärdet räknas fram HÄR och skickas inte in från rutan. Ett tal som
 * webbläsaren fått räkna på hinner bli gammalt medan rutan står öppen, och då
 * hade justeringen landat fel utan att någon märkt det.
 */
export async function adjustFlexBalance(
  _previous: BalanceState,
  formData: FormData
): Promise<BalanceState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Ingen anställd vald." };

  const target = hoursInputToMinutes(formData.get("flex"));

  if (target === "error" || target === null) {
    return { error: "Skriv saldot som 2:15 eller 2,25." };
  }

  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { flexOpeningMinutes: true },
  });

  if (!employee) return { error: "Personen finns inte kvar." };

  const timeZone = await timeZoneOf(companyId);
  const current = await currentFlexMinutes(db, timeZone, employeeId);

  // Utan schema finns ingen planerad tid, och då finns inget saldo att
  // justera. Att skriva en siffra ändå hade gett ett tal som försvinner i
  // samma stund som ett schema läggs upp.
  if (current === null) {
    return {
      error:
        "Flexsaldot går inte att räkna fram. Lägg upp ett arbetstidsschema först.",
    };
  }

  const before = await employeeBefore(db, employeeId);

  await db.employee.updateMany({
    where: { id: employeeId },
    data: {
      flexOpeningMinutes: employee.flexOpeningMinutes + (target - current),
    },
  });

  // En rättning av ett saldo är en rättning av en lön. Den ska gå att spåra.
  if (before) {
    await auditEmployeeChange(db, { employeeId, actorEmail: session.email, before });
  }

  revalidatePath(PATH);
  return { ok: "Flexsaldot är ändrat." };
}

/** Ingående saldon, för en kund som flyttar in med befintliga timmar. */
export async function saveOpeningBalances(
  _previous: TimesheetState,
  formData: FormData
): Promise<TimesheetState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Ingen anställd vald." };

  const timeZone = await timeZoneOf(companyId);

  // Saldon får vara negativa — ett minussaldo är ett helt normalt läge.
  const flex = hoursInputToMinutes(formData.get("flex"));
  const comp = hoursInputToMinutes(formData.get("comp"));

  if (flex === "error" || comp === "error") {
    return { error: "Skriv saldona som timmar, till exempel 12,5 eller −3." };
  }

  const rawDate = String(formData.get("since") ?? "").trim();
  const since = rawDate ? parseLocalDate(rawDate, timeZone) : null;

  if (rawDate && !since) return { error: "Datumet går inte att läsa." };

  const before = await employeeBefore(db, employeeId);

  await db.employee.updateMany({
    where: { id: employeeId },
    data: {
      flexOpeningMinutes: flex ?? 0,
      compOpeningMinutes: comp ?? 0,
      balanceOpeningDate: since,
    },
  });

  if (before) {
    await auditEmployeeChange(db, { employeeId, actorEmail: session.email, before });
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

/**
 * Ett saldo som skrivits för hand, till minuter.
 *
 * Tar BÅDA formen: "2:15" och "2,25". Skärmen visar tim:min, och det vore
 * oanständigt att kräva att man räknar om det till decimaltimmar för att
 * kunna skriva tillbaka samma tal. Decimalformen står kvar eftersom den som
 * har en siffra ur ett gammalt system ofta har den så.
 *
 * Minuttecknet får vara både det vanliga och det långa, som Word gärna byter
 * till — ett klistrat "−3" ska inte bli ett fel.
 */
function hoursInputToMinutes(
  raw: FormDataEntryValue | null
): number | null | "error" {
  const text = String(raw ?? "")
    .trim()
    .replace("−", "-")
    .replace(/\s/g, "");

  if (!text) return null;

  // Tim:min. BARA kolon räknas som avskiljare: punkt är ett decimaltecken,
  // och "2.25" ska vara två och en kvarts timme och inte 2 timmar 25 minuter.
  //
  // Minuterna är alltid positiva; tecknet hör till hela saldot, så "−0:45" är
  // minus trekvart och inte minus noll plus trekvart.
  const colon = text.match(/^(-?)(\d+):(\d{1,2})$/);

  if (colon) {
    const minutes = Number(colon[3]);
    if (minutes > 59) return "error";

    const total = Number(colon[2]) * 60 + minutes;
    return colon[1] === "-" ? -total : total;
  }

  const hours = Number(text.replace(",", "."));
  if (!Number.isFinite(hours)) return "error";

  return Math.round(hours * 60);
}
