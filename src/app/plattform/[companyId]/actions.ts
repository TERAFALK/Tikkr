"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteCompany,
  PlatformActionError,
  requirePlatformAdmin,
  saveNote,
  setLicensesManually,
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

export interface LicenseFormState {
  error?: string;
  ok?: string;
}

/**
 * Sätter antalet licenser för en fakturakund.
 *
 * Samma krav på dokumenterad anledning som statusändringen. Ett ändrat antal
 * licenser är en ändring av vad kunden ska faktureras, och den ska gå att
 * förklara ett halvår senare.
 */
export async function changeLicenseCount(
  _previous: LicenseFormState,
  formData: FormData
): Promise<LicenseFormState> {
  const { email } = await requirePlatformAdmin();

  const companyId = String(formData.get("companyId") ?? "");
  const licenses = Number(formData.get("licenses"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!companyId) return { error: "Okänt företag." };
  if (!reason) return { error: "Ange en anledning till ändringen." };

  try {
    await setLicensesManually({
      actorEmail: email,
      companyId,
      licenses,
      reason,
    });
  } catch (error) {
    if (error instanceof PlatformActionError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/plattform/${companyId}`);
  revalidatePath("/plattform");

  return { ok: `Antalet är satt till ${licenses}.` };
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

export interface DeleteCompanyState {
  error?: string;
}

/**
 * Raderar kundföretaget.
 *
 * Omdirigerar till kundöversikten när det gått igenom — sidan vi står på finns
 * då inte längre, och att lämna kvar besökaren där vore att visa en tom sida
 * med företagets namn i rubriken.
 */
export async function removeCompany(
  _previous: DeleteCompanyState,
  formData: FormData
): Promise<DeleteCompanyState> {
  const { email } = await requirePlatformAdmin();

  const companyId = String(formData.get("companyId") ?? "");
  if (!companyId) return { error: "Okänt företag." };

  try {
    await deleteCompany({
      actorEmail: email,
      companyId,
      confirmName: String(formData.get("confirmName") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    if (error instanceof PlatformActionError) return { error: error.message };
    throw error;
  }

  revalidatePath("/plattform");

  // Ligger utanför try-blocket: redirect() avbryter genom att kasta.
  redirect("/plattform");
}
