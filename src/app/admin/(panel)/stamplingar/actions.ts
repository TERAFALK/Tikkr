"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  ClockError,
  createManualEntry,
  updateEntryManually,
} from "@/lib/clock";
import { parseLocalDateTime } from "@/lib/time-zone";

const PATH = "/admin/stamplingar";

export interface EntryFormState {
  error?: string;
  ok?: string;
}

async function companyTimeZone(companyId: string): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  return company?.timezone ?? "Europe/Stockholm";
}

function readForm(formData: FormData, timeZone: string) {
  const clockInAt = parseLocalDateTime(
    String(formData.get("clockInAt") ?? ""),
    timeZone
  );
  const clockOutAt = parseLocalDateTime(
    String(formData.get("clockOutAt") ?? ""),
    timeZone
  );

  return {
    employeeId: String(formData.get("employeeId") ?? ""),
    orderId: String(formData.get("orderId") ?? ""),
    momentId: String(formData.get("momentId") ?? ""),
    clockInAt,
    clockOutAt,
  };
}

export async function addEntry(
  _previous: EntryFormState,
  formData: FormData
): Promise<EntryFormState> {
  const { companyId, email } = await requireAdmin();
  const timeZone = await companyTimeZone(companyId);
  const input = readForm(formData, timeZone);

  if (!input.employeeId || !input.orderId || !input.momentId) {
    return { error: "Välj anställd, order och arbetsmoment." };
  }
  if (!input.clockInAt || !input.clockOutAt) {
    return { error: "Fyll i både start- och sluttid." };
  }

  try {
    await createManualEntry(companyId, {
      employeeId: input.employeeId,
      orderId: input.orderId,
      momentId: input.momentId,
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      byEmail: email,
    });
  } catch (error) {
    // ClockError bär ett meddelande skrivet för att läsas av en människa.
    if (error instanceof ClockError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  revalidatePath("/admin");
  return { ok: "Stämplingen är inlagd." };
}

export async function editEntry(formData: FormData) {
  const { companyId, email } = await requireAdmin();
  const timeZone = await companyTimeZone(companyId);

  const id = String(formData.get("id") ?? "");
  const input = readForm(formData, timeZone);
  if (!id || !input.clockInAt || !input.clockOutAt) return;

  try {
    await updateEntryManually(companyId, id, {
      employeeId: input.employeeId,
      orderId: input.orderId,
      momentId: input.momentId,
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      byEmail: email,
    });
  } catch (error) {
    if (error instanceof ClockError) return;
    throw error;
  }

  revalidatePath(PATH);
}

/**
 * Raderar en stämpling.
 *
 * Finns för felregistreringar — någon stämplade in på fel person eller fel
 * order. Gränssnittet frågar innan, eftersom raderad tid inte går att få
 * tillbaka och det är fakturaunderlag som försvinner.
 */
export async function deleteEntry(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db.timeEntry.delete({ where: { id } });
  revalidatePath(PATH);
  revalidatePath("/admin");
}
