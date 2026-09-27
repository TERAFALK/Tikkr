"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
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
  const session = await requireAdmin();
  await assertWritable(session);
  const { companyId } = session;

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
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

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
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.kioskDevice.deleteMany({ where: { id } });
  revalidatePath(PATH);
}

/**
 * Ställer ljusstyrkan på en skärm.
 *
 * Bara meningsfullt på skärmar som kör i kioskappen — panelen visar därför
 * fältet bara för dem. Kontrolleras ändå här: en serveråtgärd är en publik
 * ingång och får inte lita på att gränssnittet höll emot.
 *
 * Skärmen plockar upp värdet vid nästa pollning, alltså inom några sekunder.
 */
export async function setBrightness(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const raw = Number(formData.get("brightness"));
  if (!Number.isFinite(raw)) return;

  const brightness = Math.min(100, Math.max(0, Math.round(raw)));

  // Går genom företagsfiltret, och träffar inget om skärmen saknar appen.
  await db.kioskDevice.updateMany({
    where: { id, fullyVersion: { not: null } },
    data: { brightness },
  });

  revalidatePath(PATH);
}

/**
 * Ber en skärm starta om.
 *
 * Skriver en tidpunkt, inte ett kommando i en kö. Skärmen jämför med den den
 * såg sist och startar om när värdet ändrats medan den varit igång — ett
 * önskemål som redan låg där när sidan laddades verkställs aldrig, annars hade
 * varje omstart lett till nästa.
 *
 * Är skärmen nere händer ingenting förrän den kommer tillbaka, och då är
 * omstarten överflödig. Det är rätt beteende: den har just startat.
 */
export async function requestRestart(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.kioskDevice.updateMany({
    where: { id, fullyVersion: { not: null } },
    data: { restartRequestedAt: new Date() },
  });

  revalidatePath(PATH);
}
