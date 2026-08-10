"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";

const PATH = "/admin/ordrar";

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
    data: { orderNumber, customerName: customerName || null },
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
