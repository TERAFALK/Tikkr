"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";

// Varje åtgärd börjar med requireAdmin(). Det ger både inloggningskontroll och
// en databasklient låst till rätt företag — en serveråtgärd är en publik
// ingång till systemet och måste skydda sig själv.

const PATH = "/admin/anstallda";

export async function createEmployee(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.employee.create({ data: { name, companyId } });
  revalidatePath(PATH);
}

export async function renameEmployee(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  await db.employee.update({ where: { id }, data: { name } });
  revalidatePath(PATH);
}

/**
 * Avaktiverar eller återaktiverar en anställd.
 *
 * Vi raderar aldrig här. En anställd som slutat har registrerad tid på ordrar
 * som ska faktureras — försvinner personen försvinner underlaget. Avaktiverad
 * betyder "visas inte längre på stämplingsskärmen", inget mer.
 *
 * Riktig radering finns i inställningarna, för GDPR-fallet.
 */
export async function toggleEmployee(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.employee.update({ where: { id }, data: { active: !active } });
  revalidatePath(PATH);
}
