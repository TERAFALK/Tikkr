"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { clean, MAX_FIELD, MAX_NAME } from "@/lib/customers";
import { parseMarkupPercent } from "@/lib/money";

const PATH = "/admin/kunder";

/**
 * Formulärets svar.
 *
 * `savedAt` och inte `ok: boolean`, av samma skäl som i anstallda/actions.ts:
 * rutan stängs på ett ändrat värde, och ett tal ändras vid varje sparning så
 * att den stängs även andra gången.
 */
export interface CustomerState {
  error?: string;
  savedAt?: number;
}

/**
 * Läser fälten och avvisar det som inte går att spara.
 *
 * Alla fält utom namnet är frivilliga. Ett kundregister som kräver org.nr
 * innan man får lägga upp någon blir ett register ingen fyller i.
 */
function readForm(formData: FormData):
  | { error: string }
  | {
      data: {
        name: string;
        customerNumber: string | null;
        orgNumber: string | null;
        contactName: string | null;
        email: string | null;
        phone: string | null;
        addressLine: string | null;
        postalCode: string | null;
        city: string | null;
        notes: string | null;
        markupPercent: number | null;
        discountPercent: number | null;
      };
    } {
  const name = clean(formData.get("name"));
  if (!name) return { error: "Ange ett namn." };
  if (name.length > MAX_NAME) return { error: "Namnet är för långt." };

  // Tomt betyder "företagets standardpåslag gäller". Bara ett ifyllt men
  // obegripligt värde är ett fel.
  const rawMarkup = String(formData.get("markup") ?? "").trim();
  const markupPercent = rawMarkup === "" ? null : parseMarkupPercent(rawMarkup);

  if (rawMarkup !== "" && markupPercent === null) {
    return {
      error:
        "Skriv påslaget som en faktor mellan 1 och 10, till exempel 1,3 för " +
        "trettio procents påslag. Lämna tomt för företagets standard.",
    };
  }

  const rawDiscount = String(formData.get("discount") ?? "").trim();
  const discountPercent =
    rawDiscount === "" ? null : Number(rawDiscount.replace(",", "."));

  if (
    rawDiscount !== "" &&
    (!Number.isFinite(discountPercent) ||
      discountPercent === null ||
      discountPercent < 0 ||
      discountPercent >= 100)
  ) {
    // Hundra procent vore att arbeta gratis. Att avvisa det är inte att
    // bestämma över kundens affärer — det är att fånga ett tangentbordsfel
    // innan det står på en faktura.
    return {
      error:
        "Skriv rabatten som procent mellan 0 och 99, till exempel 10. " +
        "Lämna tomt för ingen rabatt.",
    };
  }

  const fields = {
    customerNumber: clean(formData.get("customerNumber")),
    orgNumber: clean(formData.get("orgNumber")),
    contactName: clean(formData.get("contactName")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    addressLine: clean(formData.get("addressLine")),
    postalCode: clean(formData.get("postalCode")),
    city: clean(formData.get("city")),
    notes: clean(formData.get("notes")),
  };

  for (const value of Object.values(fields)) {
    if (value && value.length > MAX_FIELD) {
      return { error: "Ett av fälten är för långt." };
    }
  }

  return {
    data: {
      name,
      ...fields,
      markupPercent,
      discountPercent: discountPercent === null ? null : Math.round(discountPercent),
    },
  };
}

export async function createCustomer(
  _previous: CustomerState,
  formData: FormData
): Promise<CustomerState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const read = readForm(formData);
  if ("error" in read) return read;

  try {
    await db.customer.create({ data: { companyId, ...read.data } });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

export async function updateCustomer(
  _previous: CustomerState,
  formData: FormData
): Promise<CustomerState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Okänd kund." };

  const read = readForm(formData);
  if ("error" in read) return read;

  try {
    // updateMany och inte update: id:t kommer från formuläret och får aldrig
    // kunna peka på en annan kunds rad. Filtret ger då noll rader i stället
    // för en ändring.
    await db.customer.updateMany({ where: { id }, data: read.data });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

/**
 * Avaktiverar eller aktiverar en kund.
 *
 * Aldrig radering. En kund med ordrar går inte att ta bort — `onDelete:
 * Restrict` i schemat — och en avaktiverad kund behåller sina gamla ordrar men
 * går inte att lägga nya på.
 */
export async function toggleCustomer(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.customer.updateMany({ where: { id }, data: { active } });
  revalidatePath(PATH);
}

/** Översätter databasens fel till något som går att rätta. */
function describeError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code === "P2002") {
    return "Kundnumret används redan av en annan kund.";
  }

  return "Kunden kunde inte sparas. Försök igen.";
}
