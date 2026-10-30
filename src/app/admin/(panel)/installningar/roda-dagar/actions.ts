"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { addHoliday, HolidayError, removeHoliday } from "@/lib/holidays";
import { parseLocalDate, startOfDayIn } from "@/lib/time-zone";

/**
 * RÖDA DAGAR, SOM KUNDEN LÄGGER IN SJÄLV (tillagt 2026-10-13).
 *
 * Hör till löneunderlaget och är grindat: en röd dag ändrar bara planerad
 * tid, och planerad tid finns bara i tidrapporten. Se src/lib/holidays.ts.
 */

const PATH = "/admin/installningar/roda-dagar";

/** `ok` och inte `savedAt`, eftersom ActionDialog stänger sig på just det fältet. */
export interface HolidayState {
  error?: string;
  ok?: string;
}

export async function addHolidayAction(
  _previous: HolidayState,
  formData: FormData
): Promise<HolidayState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId, email } = session;

  const timeZone = await companyTimeZone(companyId);
  const date = parseLocalDate(String(formData.get("date") ?? ""), timeZone);
  if (!date) return { error: "Ange ett datum." };

  try {
    // Vid dygnets början, som frånvaron. parseLocalDate landar klockan 12.
    await addHoliday(db, companyId, {
      date: startOfDayIn(date, timeZone),
      name: String(formData.get("name") ?? ""),
      byEmail: email,
    });
  } catch (error) {
    if (error instanceof HolidayError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
  return { ok: "Dagen är inlagd." };
}

export async function deleteHolidayAction(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await removeHoliday(session.db, id, session.email);

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
}
