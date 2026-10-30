"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { isUniqueViolation } from "@/lib/save-state";
import type { DialogState } from "@/components/ui/ActionDialog";

/**
 * RASTTYPERNA för stämplingsskärmen, som Frukost och Lunch. Löneunderlagets.
 *
 * Företagets arbetstider låg på samma sida till 2026-10-17, och ligger nu
 * under Inställningar, Arbetsytan, Arbetstider. De är arbetsytans och inte
 * löneunderlagets: planeringen läser dem också. Se lib/work-hours.ts.
 */

const PATH = "/admin/installningar/schema";

/* --- Rasttyper ----------------------------------------------------------- */

export async function createBreakType(
  _previous: DialogState,
  formData: FormData
): Promise<DialogState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ange ett namn.", field: "name" };

  const count = await db.breakType.count();

  try {
    await db.breakType.create({
      data: { companyId, name, sortOrder: count },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Det finns redan en rast med det namnet.", field: "name" };
    }
    throw error;
  }

  revalidatePath(PATH);
  return { ok: "Rasten är tillagd." };
}

export async function toggleBreakType(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.breakType.updateMany({ where: { id }, data: { active: !active } });

  revalidatePath(PATH);
}
