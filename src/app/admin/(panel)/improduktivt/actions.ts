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

/**
 * Tar bort ett improduktivt moment som ALDRIG ANVÄNTS.
 *
 * Ett moment med registrerad tid raderas aldrig, det avaktiveras — tiden är
 * underlag för en lön, och en post vars moment försvunnit går inte att
 * förklara i efterhand. Samma regel som för ordrar och arbetsmoment, se
 * CLAUDE.md § 3 regel 1, och databasen vägrar dessutom (`onDelete: Restrict`).
 *
 * Men ett moment som lagts upp av misstag och aldrig stämplats på bär
 * ingenting. Det ska gå att städa bort, av samma skäl som en station utan
 * planer går att ta bort: den som provat sig fram ska inte tvingas leva med
 * "Städnign" i listan för alltid.
 *
 * Räknar posterna först och svarar med ett besked i stället för att låta
 * databasen kasta. Felet från en främmande nyckel går inte att visa för en
 * verkstadschef.
 */
export async function deleteIndirectMoment(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const used = await db.timeEntry.count({ where: { indirectMomentId: id } });
  if (used > 0) return;

  await db.indirectMoment.deleteMany({ where: { id } });
  revalidatePath(PATH);
}
