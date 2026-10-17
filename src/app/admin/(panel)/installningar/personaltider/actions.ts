"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { readWeeklyHours } from "@/lib/weekly-hours";
import {
  removeOwnStaffHours,
  saveOwnStaffHours,
  saveStandardStaffHours,
} from "@/lib/staff-hours";
import { saved, type SaveState } from "@/lib/save-state";
import type { DialogState } from "@/components/ui/ActionDialog";

/**
 * PERSONALENS ARBETSTIDER I PLANERINGEN (tillagt 2026-10-17, fas 3).
 *
 * Läser formulären och lämnar över. Villkoren ligger i lib/staff-hours.ts, och
 * fälten läses av samma `readWeeklyHours` som stationernas och schemats.
 */

function revalidate() {
  revalidatePath("/admin/installningar/personaltider");
  revalidatePath("/admin/planering");
}

/** Företagets standard. Inga ikryssade dagar tar bort standarden. */
export async function saveStandardStaffHoursAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const read = readWeeklyHours(formData);
  if ("error" in read) return { error: read.error };

  const result = await saveStandardStaffHours(
    session.db,
    session.companyId,
    read.days
  );

  if (result.error) return { error: result.error };

  revalidate();
  return saved();
}

/** En anställds egna tider. */
export async function saveOwnStaffHoursAction(
  _previous: DialogState,
  formData: FormData
): Promise<DialogState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Den anställda finns inte." };

  const read = readWeeklyHours(formData);
  if ("error" in read) return { error: read.error };

  const result = await saveOwnStaffHours(
    session.db,
    session.companyId,
    employeeId,
    read.days
  );

  if (result.error) return { error: result.error };

  revalidate();
  return { ok: "Sparat." };
}

/** Tar bort en anställds egna tider. Företagets standard gäller igen. */
export async function removeOwnStaffHoursAction(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return;

  await removeOwnStaffHours(session.db, employeeId);
  revalidate();
}
