"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertWritable, isOwner, requireAdmin } from "@/lib/admin-session";
import { PRODUCT_KEYS } from "@/lib/shop/catalog";
import { deliverPendingForOrder } from "@/lib/shop/notify";
import { OrderError, placeOrder } from "@/lib/shop/orders";
import { needsDelivery } from "@/lib/shop/pricing";
import {
  readProfileForm,
  validateProfile,
  type ProfileErrors,
  type ProfileValues,
} from "@/lib/shop/profile";

/** Det kassan får tillbaka när något inte gick, med det som skrevs. */
export interface CheckoutState {
  error?: string;
  fieldErrors?: ProfileErrors;
  values?: ProfileValues;
  separateBilling?: boolean;
  saveProfile?: boolean;
}

/**
 * LÄGGER EN BESTÄLLNING FRÅN KASSAN.
 *
 * BARA ÄGAREN (beslutat 2026-10-20), av samma skäl som prenumerationen: en
 * beställning ändrar vad kunden betalar. Prövas här och inte bara genom att
 * formuläret döljs, eftersom en serveråtgärd nås även utan sidan. Bevisas av
 * tests/owner-coverage.test.ts.
 *
 * Kassan skickar antal per produkt, ur varukorgen, och uppgifterna. Pris och
 * moms räknas i placeOrder, ur prislistan, aldrig ur formuläret.
 *
 * Mejlet skickas efter att beställningen sparats. Går det inte iväg står
 * beställningen kvar, och felet syns för oss i plattformspanelen.
 */
export async function placeShopOrder(
  _previous: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const session = await requireAdmin();
  await assertWritable(session);
  if (!isOwner(session)) return { error: "Bara arbetsytans ägare kan beställa." };

  const items = PRODUCT_KEYS.map((key) => ({
    productKey: key,
    quantity: Number(formData.get(`qty-${key}`) ?? 0),
  })).filter((item) => item.quantity !== 0);

  const profileInput = readProfileForm(formData);
  const saveProfile = formData.get("saveProfile") === "on";

  const echo = {
    values: profileInput.values,
    separateBilling: profileInput.separateBilling,
    saveProfile,
  };

  const { errors, clean } = validateProfile(profileInput, {
    requireForOrder: true,
    delivery: needsDelivery(items),
  });

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
    console.error(`[butik] Orderbekräftelsen för ${result.number} gick inte iväg`, error);
  }

  revalidatePath("/admin/butik/bestallningar");
  revalidatePath("/admin/installningar");

  redirect(`/admin/butik/bestallningar?bestallning=${result.number}`);
}
