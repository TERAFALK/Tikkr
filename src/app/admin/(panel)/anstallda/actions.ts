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

/** Vad ett porträtt får vara. Samma gränser som för logotyperna. */
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PHOTO_MAX_BYTES = 512 * 1024;

export interface PhotoState {
  error?: string;
  ok?: string;
}

/**
 * Laddar upp ett porträtt.
 *
 * Bilden sparas som den är, utan omskalning. Skälet är att servern då slipper
 * ett bildbibliotek, och att gränsen på 512 kB ändå tvingar fram en rimlig
 * storlek — en telefonbild på fem megabyte avvisas med ett besked om vad som
 * gäller i stället för att tyst krympas till något suddigt.
 */
export async function uploadEmployeePhoto(
  _previous: PhotoState,
  formData: FormData
): Promise<PhotoState> {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const file = formData.get("photo");

  if (!id) return { error: "Okänd person." };

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Välj en bildfil." };
  }

  if (!PHOTO_TYPES.includes(file.type)) {
    return { error: "Bilden måste vara PNG, JPEG eller WebP." };
  }

  if (file.size > PHOTO_MAX_BYTES) {
    return {
      error: `Bilden är ${Math.round(file.size / 1024)} kB. Högsta storlek är 512 kB.`,
    };
  }

  // Går via företagsfiltret: ett id från formuläret får aldrig kunna peka på
  // en annan kunds anställd.
  await db.employee.updateMany({
    where: { id },
    data: {
      photoData: Buffer.from(await file.arrayBuffer()),
      photoMimeType: file.type,
      photoUpdatedAt: new Date(),
    },
  });

  revalidatePath(PATH);
  return { ok: "Bilden är uppdaterad." };
}

/** Tar bort porträttet. Personen och den registrerade tiden rörs inte. */
export async function removeEmployeePhoto(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.employee.updateMany({
    where: { id },
    data: { photoData: null, photoMimeType: null, photoUpdatedAt: new Date() },
  });

  revalidatePath(PATH);
}
