"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";

const PATH = "/admin/moment";

export async function createMoment(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.workMoment.create({ data: { companyId, name } });
  revalidatePath(PATH);
}

export async function renameMoment(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  await db.workMoment.update({ where: { id }, data: { name } });
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
