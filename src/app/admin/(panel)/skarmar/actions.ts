"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { createKioskDevice, startPairing } from "@/lib/kiosk-auth";
import { assertLicenseAvailable, LicenseError } from "@/lib/licenses";

const PATH = "/admin/skarmar";

export interface PairingFormState {
  error?: string;
  /** Koden att läsa upp för den som står vid skärmen. */
  code?: string;
  /** När koden slutar gälla, som ISO-sträng. */
  expiresAt?: string;
  deviceName?: string;
}

/**
 * Skapar en ny stämplingsskärm.
 *
 * Skärmen finns i listan direkt, i läget "väntar på koppling", och får en
 * sexsiffrig kod som gäller i fem minuter. Koden läses upp för den som står
 * vid skärmen — ingen behöver kopiera en länk.
 */
export async function addDevice(
  _previous: PairingFormState,
  formData: FormData
): Promise<PairingFormState> {
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

  const { device, pairing } = await createKioskDevice(companyId, name);

  revalidatePath(PATH);

  return {
    code: pairing.code,
    expiresAt: pairing.expiresAt.toISOString(),
    deviceName: device.name,
  };
}

/**
 * Ger en befintlig skärm en ny kod.
 *
 * Ersätter det gamla återkalla-och-skapa-ny. Den gamla token nollas, så en
 * borttappad surfplatta slutar fungera i samma stund — men skärmens namn,
 * historik och licens är kvar. Det är samma skärm på samma vägg, bara på en ny
 * enhet.
 */
export async function repairDevice(
  _previous: PairingFormState,
  formData: FormData
): Promise<PairingFormState> {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Okänd skärm." };

  // Går genom företagsfiltret: ett id ur ett formulär får aldrig kunna peka på
  // en annan kunds skärm.
  const device = await db.kioskDevice.findFirst({ where: { id } });
  if (!device) return { error: "Okänd skärm." };

  const pairing = await startPairing(device.id);

  revalidatePath(PATH);

  return {
    code: pairing.code,
    expiresAt: pairing.expiresAt.toISOString(),
    deviceName: device.name,
  };
}

/**
 * Raderar en skärm.
 *
 * Går nu oavsett läge, eftersom återkalla-steget är borta. Stämplingar som
 * gjorts på skärmen finns kvar med sin tid, men tappar noteringen om vilken
 * skärm de kom från. Det är den enda förlusten, och den står i bekräftelsen så
 * att ingen blir överraskad.
 *
 * Att radera frigör licensen.
 */
export async function deleteDevice(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.kioskDevice.deleteMany({ where: { id } });
  revalidatePath(PATH);
}
