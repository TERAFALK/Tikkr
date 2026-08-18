"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";

const PATH = "/admin/ordrar";

/**
 * Läser ett timfält och ger minuter.
 *
 * Administratören tänker i timmar, systemet räknar i minuter. Både punkt och
 * komma godtas som decimaltecken — ett svenskt tangentbord ger komma, och att
 * avvisa "7,5" hade varit att kräva att kunden skriver som datorn vill.
 *
 * Tomt fält betyder ingen beräknad tid, vilket är något annat än noll timmar.
 */
function parseHours(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;

  const hours = Number(text);
  if (!Number.isFinite(hours) || hours <= 0) return null;

  return Math.round(hours * 60);
}

export async function createOrder(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!orderNumber) return;

  await db.order.create({
    data: {
      companyId,
      orderNumber,
      customerName: customerName || null,
      budgetMinutes: parseHours(formData.get("budgetHours")),
    },
  });

  revalidatePath(PATH);
}

export async function updateOrder(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!id || !orderNumber) return;

  await db.order.update({
    where: { id },
    data: {
      orderNumber,
      customerName: customerName || null,
      budgetMinutes: parseHours(formData.get("budgetHours")),
    },
  });

  revalidatePath(PATH);
}

/**
 * Öppnar eller stänger en order.
 *
 * Stängd order försvinner från stämplingsskärmen men behåller sin tid. Det är
 * så en färdig order avslutas — ordrar raderas aldrig, eftersom den
 * registrerade tiden är fakturaunderlag.
 */
export async function toggleOrder(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id) return;

  await db.order.update({
    where: { id },
    data: { status: status === "OPEN" ? "CLOSED" : "OPEN" },
  });

  revalidatePath(PATH);
}
