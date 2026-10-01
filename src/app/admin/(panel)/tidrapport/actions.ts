"use server";

import { revalidatePath } from "next/cache";
import type { AbsenceType } from "@prisma/client";
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
 * Läser ett timfält och ger minuter.
 *
 * Tomt betyder hela den schemalagda dagen, vilket är det vanliga fallet — en
 * sjukdag är en hel dag. Bara ett ifyllt men obegripligt värde är ett fel.
 */
function parseHours(raw: FormDataEntryValue | null): number | null | "error" {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;

  const hours = Number(text);
  if (!Number.isFinite(hours) || hours <= 0) return "error";

  return Math.round(hours * 60);
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
  const type = String(formData.get("type") ?? "") as AbsenceType;
  const rawFrom = String(formData.get("from") ?? "");
  const rawTo = String(formData.get("to") ?? "").trim();

  if (!employeeId) return { error: "Ingen anställd vald." };
  if (!type) return { error: "Välj en frånvaroorsak." };

  const timeZone = await timeZoneOf(companyId);

  const from = parseLocalDate(rawFrom, timeZone);
  if (!from) return { error: "Ange ett datum." };

  // Tomt slutdatum betyder en enda dag. En sjukanmälan gäller oftast i dag.
  const to = rawTo ? parseLocalDate(rawTo, timeZone) : from;
  if (!to) return { error: "Slutdatumet går inte att läsa." };
  if (to < from) return { error: "Slutdatumet ligger före startdatumet." };

  const minutes = parseHours(formData.get("hours"));
  if (minutes === "error") {
    return {
      error: "Skriv antalet timmar som ett tal, till exempel 4 eller 3,5.",
    };
  }

  // En period skrivs som en post per dag. Det gör att en enskild dag går att
  // rätta eller ta bort utan att hela sjukperioden måste läggas om.
  const { daysInPeriod } = await import("@/lib/schedule");

  try {
    for (const date of daysInPeriod(from, to, timeZone)) {
      await markAbsence(db, companyId, timeZone, {
        employeeId,
        date,
        type,
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

  await removeAbsence(session.db, id);
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

  const minutes = parseHours(formData.get("hours"));
  if (minutes === "error" || minutes === null) {
    return { error: "Ange antalet timmar som godkänts som komptid." };
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

  await removeCompAdjustment(session.db, id);
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

  const target = decimalHoursToMinutes(formData.get("flex"));

  if (target === "error" || target === null) {
    return { error: "Skriv saldot som timmar, till exempel 12,5 eller −3." };
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

  await db.employee.updateMany({
    where: { id: employeeId },
    data: {
      flexOpeningMinutes: employee.flexOpeningMinutes + (target - current),
    },
  });

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
  const flex = decimalHoursToMinutes(formData.get("flex"));
  const comp = decimalHoursToMinutes(formData.get("comp"));

  if (flex === "error" || comp === "error") {
    return { error: "Skriv saldona som timmar, till exempel 12,5 eller −3." };
  }

  const rawDate = String(formData.get("since") ?? "").trim();
  const since = rawDate ? parseLocalDate(rawDate, timeZone) : null;

  if (rawDate && !since) return { error: "Datumet går inte att läsa." };

  await db.employee.updateMany({
    where: { id: employeeId },
    data: {
      flexOpeningMinutes: flex ?? 0,
      compOpeningMinutes: comp ?? 0,
      balanceOpeningDate: since,
    },
  });

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

function decimalHoursToMinutes(
  raw: FormDataEntryValue | null
): number | null | "error" {
  // Både vanligt minustecken och det långa som Word gärna byter till.
  const text = String(raw ?? "").trim().replace(",", ".").replace("−", "-");
  if (!text) return null;

  const hours = Number(text);
  if (!Number.isFinite(hours)) return "error";

  return Math.round(hours * 60);
}
