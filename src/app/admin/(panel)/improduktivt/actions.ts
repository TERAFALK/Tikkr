"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";

const PATH = "/admin/improduktivt";

/**
 * Improduktiv tid: städning, möten, underhåll.
 *
 * Eget register, skilt från arbetsmomenten med flit. Det ska vara omöjligt att
 * råka välja Städning på en kundorder, och lika omöjligt att få med den tiden
 * i ett fakturaunderlag. En bock på arbetsmomenten hade gett båda felen en
 * chans.
 *
 * Ingen timkostnad här. Improduktiv tid kalkyleras inte — den redovisas.
 */

export async function createIndirectMoment(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.indirectMoment.create({ data: { companyId, name } });
  revalidatePath(PATH);
}

export async function renameIndirectMoment(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  await db.indirectMoment.updateMany({ where: { id }, data: { name } });
  revalidatePath(PATH);
}

export async function toggleIndirectMoment(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.indirectMoment.updateMany({ where: { id }, data: { active: !active } });
  revalidatePath(PATH);
}
