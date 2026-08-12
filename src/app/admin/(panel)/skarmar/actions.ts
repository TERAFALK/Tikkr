"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { createKioskDevice } from "@/lib/kiosk-auth";
import { assertLicenseAvailable, LicenseError } from "@/lib/licenses";

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
  if (!name) return { error: "Ge skärmen ett namn." };

  // Kontrolleras här och inte bara i gränssnittet. En serveråtgärd är en
  // publik ingång och måste skydda sig själv.
  try {
    await assertLicenseAvailable(companyId);
  } catch (error) {
    if (error instanceof LicenseError) return { error: error.message };
    throw error;
  }

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
 *
 * Att återkalla frigör en licens. Att återaktivera kräver att det finns en
 * ledig — annars skulle man kunna kringgå antalet genom att växla fram och
 * tillbaka.
 */
export async function toggleDevice(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  if (active === false) {
    try {
      await assertLicenseAvailable(companyId);
    } catch (error) {
      if (error instanceof LicenseError) return;
      throw error;
    }
  }

  await db.kioskDevice.update({ where: { id }, data: { active: !active } });
  revalidatePath(PATH);
}

/**
 * Raderar en återkallad skärm.
 *
 * Bara återkallade går att radera. En aktiv skärm står och används av någon —
 * att den försvinner mitt i ett arbetspass vore ett fel, inte en städning.
 *
 * Stämplingar som gjorts på skärmen finns kvar med sin tid, men tappar
 * noteringen om vilken skärm de kom från. Det är den enda förlusten, och den
 * står i bekräftelsen så att ingen blir överraskad.
 */
export async function deleteDevice(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const device = await db.kioskDevice.findFirst({ where: { id } });
  if (!device || device.active) return;

  await db.kioskDevice.delete({ where: { id } });
  revalidatePath(PATH);
}
