"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertWritable, isOwner, requireAdmin } from "@/lib/admin-session";
import { PRODUCT_KEYS } from "@/lib/shop/catalog";
import { deliverPendingForOrder } from "@/lib/shop/notify";
import { OrderError, placeOrder } from "@/lib/shop/orders";
import {
  readProfileForm,
  validateProfile,
  type ProfileErrors,
  type ProfileValues,
} from "@/lib/shop/profile";

const PAGE = "/admin/installningar/tillbehor";

/** Det formuläret får tillbaka när något inte gick, med det som skrevs. */
export interface OrderFormState {
  error?: string;
  fieldErrors?: ProfileErrors;
  values?: ProfileValues;
  separateBilling?: boolean;
  quantities?: Record<string, string>;
  saveProfile?: boolean;
}

/**
 * LÄGGER EN BESTÄLLNING.
 *
 * BARA ÄGAREN (beslutat 2026-10-20), av samma skäl som prenumerationen: en
 * beställning ändrar vad kunden betalar. Prövas här och inte bara genom att
 * knappen döljs, eftersom en serveråtgärd nås även utan sidan. Bevisas av
 * tests/owner-coverage.test.ts.
 *
 * Formuläret skickar antal per produkt och uppgifterna. Pris och moms räknas
 * i placeOrder, ur prislistan, aldrig ur formuläret.
 *
 * Mejlet skickas efter att beställningen sparats. Går det inte iväg står
 * beställningen kvar, och felet syns för oss i plattformspanelen.
 */
export async function placeAccessoryOrder(
  _previous: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const session = await requireAdmin();
  await assertWritable(session);
  if (!isOwner(session)) return { error: "Bara arbetsytans ägare kan beställa." };

  const quantities: Record<string, string> = {};
  const items = PRODUCT_KEYS.map((key) => {
    const raw = String(formData.get(`qty-${key}`) ?? "0").trim();
    quantities[key] = raw;
    return { productKey: key, quantity: raw === "" ? 0 : Number(raw) };
  });

  const profileInput = readProfileForm(formData);
  const saveProfile = formData.get("saveProfile") === "on";

  const echo = {
    values: profileInput.values,
    separateBilling: profileInput.separateBilling,
    quantities,
    saveProfile,
  };

  const { errors, clean } = validateProfile(profileInput, { requireForOrder: true });

  if (!clean) {
    return { ...echo, error: "Kontrollera uppgifterna nedan.", fieldErrors: errors };
  }

  let result;
  try {
    result = await placeOrder({
      db: session.db,
      companyId: session.companyId,
      companyName: session.companyName,
      actorEmail: session.email,
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      items,
      profile: clean,
      saveProfile,
    });
  } catch (error) {
    if (error instanceof OrderError) return { ...echo, error: error.message };
    throw error;
  }

  try {
    await deliverPendingForOrder(result.orderId);
  } catch (error) {
    // Beställningen är sparad. Ett mejl som inte gick iväg ska inte se ut som
    // att beställningen misslyckades, för då beställer kunden en gång till.
    console.error(`[tillbehör] Orderbekräftelsen för ${result.number} gick inte iväg`, error);
  }

  revalidatePath(PAGE);
  revalidatePath("/admin/installningar");

  redirect(`${PAGE}?bestallning=${result.number}`);
}
