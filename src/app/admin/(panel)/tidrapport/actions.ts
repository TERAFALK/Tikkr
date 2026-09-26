"use server";

import { revalidatePath } from "next/cache";
import type { AbsenceType } from "@prisma/client";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  AbsenceError,
  addCompEarned,
  markAbsence,
  removeAbsence,
  removeCompAdjustment,
} from "@/lib/absence";
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
      error:
        "Skriv antalet timmar som ett tal, till exempel 4 eller 3,5. Lämna " +
        "tomt för hela dagen.",
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

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await removeCompAdjustment(session.db, id);
  revalidatePath(PATH);
}

/** Ingående saldon, för en kund som flyttar in med befintliga timmar. */
export async function saveOpeningBalances(
  _previous: TimesheetState,
  formData: FormData
): Promise<TimesheetState> {
  const session = await requireAdmin();
  await assertWritable(session);
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
