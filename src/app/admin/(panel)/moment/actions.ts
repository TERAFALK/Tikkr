"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { parseOre } from "@/lib/money";

const PATH = "/admin/moment";

export async function createMoment(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.workMoment.create({
    data: { companyId, name, costRateOre: parseOre(formData.get("costRate")) },
  });
  revalidatePath(PATH);
}

/**
 * Ändrar namn och timkostnad.
 *
 * Timkostnaden slår bara igenom på NY tid. Redan registrerade stämplingar
 * behåller den kostnad som gällde när de gjordes — annars hade en prisändring
 * ändrat en kalkyl som redan fakturerats. Se TimeEntry.momentCostRateOre i
 * schemat.
 */
export async function renameMoment(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  await db.workMoment.update({
    where: { id },
    data: { name, costRateOre: parseOre(formData.get("costRate")) },
  });
  revalidatePath(PATH);
}

export async function toggleMoment(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.workMoment.update({ where: { id }, data: { active: !active } });
  revalidatePath(PATH);
}
