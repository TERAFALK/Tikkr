"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { parseOre } from "@/lib/money";
import { isUniqueViolation } from "@/lib/save-state";
import type { DialogState } from "@/components/ui/ActionDialog";

const PATH = "/admin/installningar/arbetsmoment";

const DUPLICATE = "Det finns redan ett arbetsmoment med det namnet.";

export async function createMoment(
  _previous: DialogState,
  formData: FormData
): Promise<DialogState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ange ett namn." };

  try {
    await db.workMoment.create({
      data: { companyId, name, costRateOre: parseOre(formData.get("costRate")) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: DUPLICATE };
    throw error;
  }

  revalidatePath(PATH);
  return { ok: "Arbetsmomentet är tillagt." };
}

/**
 * Ändrar namn och timkostnad.
 *
 * Timkostnaden slår bara igenom på NY tid. Redan registrerade stämplingar
 * behåller den kostnad som gällde när de gjordes — annars hade en prisändring
 * ändrat en kalkyl som redan fakturerats. Se TimeEntry.momentCostRateOre i
 * schemat.
 */
export async function renameMoment(
  _previous: DialogState,
  formData: FormData
): Promise<DialogState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Ange ett namn." };

  try {
    await db.workMoment.update({
      where: { id },
      data: { name, costRateOre: parseOre(formData.get("costRate")) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: DUPLICATE };
    throw error;
  }

  revalidatePath(PATH);
  return { ok: "Arbetsmomentet är ändrat." };
}

export async function toggleMoment(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.workMoment.update({ where: { id }, data: { active: !active } });
  revalidatePath(PATH);
}
