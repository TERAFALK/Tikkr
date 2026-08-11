"use server";

import { revalidatePath } from "next/cache";
import {
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

export async function changeSubscription(formData: FormData) {
  const { email } = await requirePlatformAdmin();

  const companyId = String(formData.get("companyId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!companyId || !STATUSES.includes(status as SubscriptionStatus)) return;

  // Anledningen är obligatorisk. En statusändring utan förklaring är värdelös
  // den dag någon undrar varför en kund spärrades.
  if (!reason) return;

  await setSubscriptionStatus({
    actorEmail: email,
    companyId,
    status: status as SubscriptionStatus,
    reason,
  });

  revalidatePath(`/plattform/${companyId}`);
  revalidatePath("/plattform");
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
