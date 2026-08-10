"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { instantFromWallTime } from "@/lib/time-zone";

const PATH = "/admin/granskning";

/**
 * Rättar sluttiden på en post systemet gissat.
 *
 * Posten märks som ADMIN_MANUAL. Det är viktigt: en tid någon skrivit in för
 * hand ska aldrig gå att förväxla med en riktig stämpling, varken i rapporter
 * eller vid en framtida diskussion om en faktura.
 */
export async function correctEntry(formData: FormData) {
  const { db, companyId, email } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("clockOutAt") ?? "");
  if (!id || !value) return;

  // Fältet ger klockslag som det står på väggen, utan tidszon. Det måste
  // tolkas i företagets tidszon — annars hamnar en rättning gjord i juli en
  // timme fel mot en gjord i januari.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  if (!company) return;

  const clockOutAt = instantFromWallTime(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    },
    company.timezone
  );

  const entry = await db.timeEntry.findFirst({ where: { id } });
  if (!entry) return;

  // En sluttid före starttiden vore en negativ arbetsdag.
  if (clockOutAt <= entry.clockInAt) return;

  await db.timeEntry.update({
    where: { id },
    data: {
      clockOutAt,
      source: "ADMIN_MANUAL",
      needsReview: false,
      reviewNote: `Rättad av ${email}.`,
    },
  });

  revalidatePath(PATH);
}

/** Godkänner systemets gissning som den är. */
export async function approveEntry(formData: FormData) {
  const { db, email } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.timeEntry.update({
    where: { id },
    data: {
      needsReview: false,
      reviewNote: `Granskad och godkänd av ${email}.`,
    },
  });

  revalidatePath(PATH);
}
