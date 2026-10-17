"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireWorkHours } from "@/lib/company-modules";
import { readWeeklyHours } from "@/lib/weekly-hours";
import { saveDefaultSchedule } from "@/lib/work-hours";

/**
 * FÖRETAGETS ARBETSTIDER (flyttat hit 2026-10-17 från löneunderlagets sida).
 *
 * Hela veckan sparas i ett svep. Alternativet — en knapp per dag — skulle
 * göra det möjligt att lämna halva veckan osparad utan att det syns, och ett
 * halvt schema ger en planerad tid som ser rimlig ut men är fel.
 *
 * Fälten läses av samma `readWeeklyHours` som rutan med egna tider under
 * Anställda och stationernas öppettider. Samma formulärfält på flera ställen
 * ska tolkas av samma kod.
 */

export interface ScheduleFormState {
  error?: string;
  savedAt?: number;
}

export async function saveSchedule(
  _previous: ScheduleFormState,
  formData: FormData
): Promise<ScheduleFormState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireWorkHours(session);

  const read = readWeeklyHours(formData);
  if ("error" in read) return read;

  await saveDefaultSchedule(session.db, session.companyId, read.days);

  revalidatePath("/admin/installningar/arbetstider");
  revalidatePath("/admin/tidrapport");
  revalidatePath("/admin/planering");
  return { savedAt: Date.now() };
}
