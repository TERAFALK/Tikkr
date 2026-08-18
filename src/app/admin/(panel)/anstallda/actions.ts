"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";

// Varje åtgärd börjar med requireAdmin(). Det ger både inloggningskontroll och
// en databasklient låst till rätt företag — en serveråtgärd är en publik
// ingång till systemet och måste skydda sig själv.

const PATH = "/admin/anstallda";

/** Vad ett porträtt får vara. Samma gränser som för logotyperna. */
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PHOTO_MAX_BYTES = 512 * 1024;

export interface EmployeeState {
  error?: string;
  /**
   * Tidpunkten då sparandet lyckades.
   *
   * Ett värde som ändras vid varje lyckad sparning, så att rutan kan stänga
   * sig själv. En ren true-flagga hade inte gått: den ser likadan ut efter
   * andra sparningen som efter första, och rutan hade då inte stängts igen.
   */
  savedAt?: number;
}

/**
 * Läser bildfältet ur formuläret.
 *
 * Namn, nummer och bild ligger i SAMMA formulär, så att ett byte är en enda
 * handling. Ett separat bildformulär hade betytt ett extra steg att glömma —
 * och HTML tillåter inte formulär inuti formulär.
 *
 * Ger `undefined` när ingen fil valts, vilket betyder "rör inte bilden".
 */
async function readPhoto(
  formData: FormData
): Promise<
  { data: Buffer; mimeType: string } | undefined | { error: string }
> {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) return undefined;

  if (!PHOTO_TYPES.includes(file.type)) {
    return { error: "Bilden måste vara PNG, JPEG eller WebP." };
  }

  if (file.size > PHOTO_MAX_BYTES) {
    return {
      error: `Bilden är ${Math.round(file.size / 1024)} kB. Högsta storlek är 512 kB.`,
    };
  }

  return {
    data: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
  };
}

/** Tomt fält betyder inget nummer, vilket är något annat än numret "0". */
function readNumber(formData: FormData): string | null {
  const value = String(formData.get("employeeNumber") ?? "").trim();
  return value || null;
}

/**
 * Översätter databasens krockfel till något en människa förstår.
 *
 * Prisma svarar med koden P2002 när ett unikt värde redan finns. Det enda
 * unika på en anställd är anställningsnumret.
 */
function describeError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;

  if (code === "P2002") {
    return "Anställningsnumret används redan av en annan person.";
  }

  throw error;
}

export async function createEmployee(
  _previous: EmployeeState,
  formData: FormData
): Promise<EmployeeState> {
  const { db, companyId } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ange ett namn." };

  const photo = await readPhoto(formData);
  if (photo && "error" in photo) return { error: photo.error };

  try {
    await db.employee.create({
      data: {
        name,
        companyId,
        employeeNumber: readNumber(formData),
        ...(photo && {
          photoData: photo.data,
          photoMimeType: photo.mimeType,
          photoUpdatedAt: new Date(),
        }),
      },
    });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

/**
 * Ändrar namn, nummer och bild i ett svep.
 *
 * Bilden rörs bara när en ny fil valts, eller när rutan för att ta bort den
 * kryssats i. Att spara utan att välja något ska inte radera porträttet.
 */
export async function updateEmployee(
  _previous: EmployeeState,
  formData: FormData
): Promise<EmployeeState> {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!id) return { error: "Okänd person." };
  if (!name) return { error: "Ange ett namn." };

  const photo = await readPhoto(formData);
  if (photo && "error" in photo) return { error: photo.error };

  const removePhoto = formData.get("removePhoto") === "on";

  try {
    // updateMany och inte update: id:t kommer från formuläret och får aldrig
    // kunna peka på en annan kunds anställd. Företagsfiltret ser till att en
    // träff utanför det egna företaget ger noll rader i stället för en ändring.
    await db.employee.updateMany({
      where: { id },
      data: {
        name,
        employeeNumber: readNumber(formData),
        ...(photo && {
          photoData: photo.data,
          photoMimeType: photo.mimeType,
          photoUpdatedAt: new Date(),
        }),
        ...(!photo &&
          removePhoto && {
            photoData: null,
            photoMimeType: null,
            photoUpdatedAt: new Date(),
          }),
      },
    });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
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
