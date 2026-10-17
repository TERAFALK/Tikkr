"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";

/**
 * RASTTYPERNA för stämplingsskärmen, som Frukost och Lunch. Löneunderlagets.
 *
 * Företagets arbetstider låg på samma sida till 2026-10-17, och ligger nu
 * under Inställningar, Arbetsytan, Arbetstider. De är arbetsytans och inte
 * löneunderlagets: planeringen läser dem också. Se lib/work-hours.ts.
 */

const PATH = "/admin/installningar/schema";

/* --- Rasttyper ----------------------------------------------------------- */

export async function createBreakType(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const count = await db.breakType.count();

  await db.breakType.create({
    data: { companyId, name, sortOrder: count },
  });

  revalidatePath(PATH);
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
