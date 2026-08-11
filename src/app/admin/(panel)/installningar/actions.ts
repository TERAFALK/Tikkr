"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { parseTimeOfDay } from "@/lib/time-zone";

/**
 * Företagstabellen har ingen company_id och ligger därför utanför det
 * filtrerande lagret. Varje åtgärd här begränsar istället uttryckligen till
 * det företag användaren är inloggad på.
 */

export async function saveCompany(formData: FormData) {
  const { companyId } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { name },
  });

  revalidatePath("/admin/installningar");
  revalidatePath("/admin");
}

export async function saveTimeSettings(formData: FormData) {
  const { companyId } = await requireAdmin();

  const autoCloseAt = String(formData.get("autoCloseAt") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!autoCloseAt || !timezone) return;

  // Ett ogiltigt klockslag skulle få den automatiska utstämplingen att sluta
  // fungera tyst — inga fel, bara poster som aldrig stängs. Bättre att vägra.
  try {
    parseTimeOfDay(autoCloseAt);
    new Intl.DateTimeFormat("sv-SE", { timeZone: timezone });
  } catch {
    return;
  }

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { autoCloseAt, timezone },
  });

  revalidatePath("/admin/installningar/tider");
}

/**
 * Anonymiserar en anställd — GDPR:s "rätt att bli glömd".
 *
 * Vi RADERAR inte personen, och det är ett medvetet val. Registrerad tid är
 * underlag för fakturor, och fakturaunderlag måste enligt bokföringslagen
 * sparas i sju år. Raderade vi personen skulle underlaget bli obrukbart.
 *
 * Istället tas det som pekar ut individen bort: namnet ersätts med en
 * beteckning. Tiden finns kvar och går att fakturera, men går inte längre att
 * koppla till en namngiven person. Det är den tolkning som uppfyller båda
 * lagarna samtidigt.
 */
export async function anonymizeEmployee(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("employeeId") ?? "");
  const confirmation = String(formData.get("confirm") ?? "").trim();
  if (!id) return;

  // Handlingen går inte att ångra. Att skriva ordet är en billig men effektiv
  // spärr mot ett felklick i en lista av namn.
  if (confirmation.toUpperCase() !== "ANONYMISERA") return;

  const employee = await db.employee.findFirst({ where: { id } });
  if (!employee) return;

  await db.employee.update({
    where: { id },
    data: {
      name: `Anonymiserad anställd (${employee.id.slice(-4)})`,
      active: false,
    },
  });

  revalidatePath("/admin/installningar/dataskydd");
  revalidatePath("/admin/anstallda");
}
