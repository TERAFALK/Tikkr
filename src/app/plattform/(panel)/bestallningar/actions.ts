"use server";

import { revalidatePath } from "next/cache";
import type { ShopOrderStatus, ShopPaymentStatus } from "@prisma/client";
import { unsafeGlobalPrisma } from "@/lib/db";
import { parseOre } from "@/lib/money";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  addShopNote,
  changeShopStatus,
  setShopPayment,
  setShopShipping,
  ShopActionError,
} from "@/lib/shop/admin";
import { deliverEventEmail, deliverPendingForOrder } from "@/lib/shop/notify";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/shop/status";
import { parseLocalDate } from "@/lib/time-zone";

/**
 * PLATTFORMENS ÅTGÄRDER FÖR EN BESTÄLLNING.
 *
 * Varje åtgärd prövar behörigheten själv. Logiken och prövningen av vad som
 * får ändras ligger i src/lib/shop/admin.ts; här läses formuläret och
 * beskedet formuleras.
 */

export interface ShopFormState {
  error?: string;
  ok?: string;
}

const LIST = "/plattform/bestallningar";

function isStatus(value: string): value is ShopOrderStatus {
  return Object.hasOwn(STATUS_LABEL, value);
}

function isPayment(value: string): value is ShopPaymentStatus {
  return Object.hasOwn(PAYMENT_LABEL, value);
}

function refresh(orderId: string) {
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${orderId}`);
}

/** Ändrar läget och skickar mejlet som hör till, om något hör till. */
export async function changeStatusAction(
  _previous: ShopFormState,
  formData: FormData
): Promise<ShopFormState> {
  const { email } = await requirePlatformAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");

  if (!isStatus(from) || !isStatus(to)) return { error: "Välj ett läge." };

  let result;
  try {
    result = await changeShopStatus({
      orderId,
      from,
      to,
      message: String(formData.get("message") ?? ""),
      actorEmail: email,
    });
  } catch (error) {
    if (error instanceof ShopActionError) return { error: error.message };
    throw error;
  }

  if (result.emailQueued) await deliverPendingForOrder(orderId);

  refresh(orderId);
  return { ok: `Ändrad till ${STATUS_LABEL[to]}.` };
}

/** Transportör, spårningslänk och frakt. */
export async function setShippingAction(
  _previous: ShopFormState,
  formData: FormData
): Promise<ShopFormState> {
  const { email } = await requirePlatformAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  const rawShipping = String(formData.get("shipping") ?? "").trim();
  const shippingOre = rawShipping ? parseOre(rawShipping) : null;

  if (rawShipping && shippingOre === null) {
    return { error: "Frakten ska vara ett belopp i kronor, t.ex. 450." };
  }

  try {
    await setShopShipping({
      orderId,
      carrier: String(formData.get("carrier") ?? ""),
      trackingUrl: String(formData.get("trackingUrl") ?? ""),
      shippingOre,
      actorEmail: email,
    });
  } catch (error) {
    if (error instanceof ShopActionError) return { error: error.message };
    throw error;
  }

  refresh(orderId);
  return { ok: "Leveransen är ändrad." };
}

/** Betalstatusen, så som fakturan står i Fortnox. */
export async function setPaymentAction(
  _previous: ShopFormState,
  formData: FormData
): Promise<ShopFormState> {
  const { email } = await requirePlatformAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");

  if (!isPayment(from) || !isPayment(to)) return { error: "Välj en betalstatus." };

  const rawDate = String(formData.get("date") ?? "").trim();
  const date = rawDate ? parseLocalDate(rawDate, "Europe/Stockholm") : null;
  if (rawDate && !date) return { error: "Datumet går inte att tolka." };

  try {
    await setShopPayment({
      orderId,
      from,
      to,
      invoiceNumber: String(formData.get("invoiceNumber") ?? ""),
      date,
      actorEmail: email,
    });
  } catch (error) {
    if (error instanceof ShopActionError) return { error: error.message };
    throw error;
  }

  refresh(orderId);
  return { ok: `Ändrad till ${PAYMENT_LABEL[to]}.` };
}

export async function addNoteAction(
  _previous: ShopFormState,
  formData: FormData
): Promise<ShopFormState> {
  const { email } = await requirePlatformAdmin();
  const orderId = String(formData.get("orderId") ?? "");

  try {
    await addShopNote({ orderId, body: String(formData.get("body") ?? ""), actorEmail: email });
  } catch (error) {
    if (error instanceof ShopActionError) return { error: error.message };
    throw error;
  }

  refresh(orderId);
  return { ok: "Anteckningen är sparad." };
}

/**
 * Skickar ett mejl som inte gick iväg en gång till.
 *
 * Bara ett som misslyckats. Ett mejl som gått fram skickas inte om härifrån;
 * det vore att be kunden läsa samma besked två gånger.
 */
export async function resendEmailAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const eventId = String(formData.get("eventId") ?? "");
  const event = await unsafeGlobalPrisma.shopOrderEvent.findUnique({
    where: { id: eventId },
    select: { orderId: true, emailState: true },
  });

  if (!event || event.emailState !== "FAILED") return;

  await deliverEventEmail(eventId);
  refresh(event.orderId);
}
