"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { createKioskDevice } from "@/lib/kiosk-auth";

const PATH = "/admin/skarmar";

/**
 * Skapar en ny kioskskärm.
 *
 * Token lämnas tillbaka EN gång och sparas aldrig i klartext. Den skickas via
 * adressfältet till samma sida, som visar kopplingslänken och sedan glömmer
 * den. Tappas den bort skapas en ny skärm — det finns ingen väg att få fram
 * token igen, och det är avsiktligt.
 */
export async function addDevice(formData: FormData) {
  const { companyId } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const { token } = await createKioskDevice(companyId, name);

  revalidatePath(PATH);
  return { token };
}

/**
 * Återkallar eller återaktiverar en skärm.
 *
 * En återkallad skärm slutar fungera omedelbart, utan att någon behöver röra
 * själva skärmen. Det är åtgärden om en surfplatta blir stulen eller en
 * kopplingslänk kommer på avvägar.
 */
export async function toggleDevice(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.kioskDevice.update({ where: { id }, data: { active: !active } });
  revalidatePath(PATH);
}
