"use server";

import { revalidatePath } from "next/cache";
import {
  PlatformActionError,
  requirePlatformAdmin,
  saveNote,
  setSubscriptionStatus,
  type SubscriptionStatus,
} from "@/lib/platform-admin";

const STATUSES: SubscriptionStatus[] = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
];

export interface SubscriptionFormState {
  error?: string;
  ok?: string;
}

export async function changeSubscription(
  _previous: SubscriptionFormState,
  formData: FormData
): Promise<SubscriptionFormState> {
  const { email } = await requirePlatformAdmin();

  const companyId = String(formData.get("companyId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!companyId || !STATUSES.includes(status as SubscriptionStatus)) {
    return { error: "Ogiltig status." };
  }

  // Anledningen är obligatorisk. En statusändring utan dokumenterat skäl går
  // inte att förklara i efterhand.
  if (!reason) {
    return { error: "Ange en anledning till ändringen." };
  }

  try {
    await setSubscriptionStatus({
      actorEmail: email,
      companyId,
      status: status as SubscriptionStatus,
      reason,
    });
  } catch (error) {
    if (error instanceof PlatformActionError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/plattform/${companyId}`);
  revalidatePath("/plattform");

  return { ok: "Statusen är ändrad." };
}

export async function updateNote(formData: FormData) {
  const { email } = await requirePlatformAdmin();

  const companyId = String(formData.get("companyId") ?? "");
  if (!companyId) return;

  await saveNote({
    actorEmail: email,
    companyId,
    body: String(formData.get("body") ?? ""),
  });

  revalidatePath(`/plattform/${companyId}`);
}
