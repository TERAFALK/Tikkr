"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import {
  changeLicenseCount,
  createCheckoutSession,
  createPortalSession,
} from "@/lib/billing";
import { LicenseError } from "@/lib/licenses";

/**
 * Adressen byggs ur anropet istället för att gissas, så att Stripe skickar
 * tillbaka kunden dit den faktiskt kom ifrån — labbadress, portal.tikkr.se
 * eller något annat.
 */
async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function startCheckout(formData: FormData) {
  const session = await requireAdmin();

  const url = await createCheckoutSession({
    companyId: session.companyId,
    companyName: session.companyName,
    email: session.email,
    baseUrl: await baseUrl(),
    interval: String(formData.get("interval")) === "year" ? "year" : "month",
    screens: Number(formData.get("screens")) || 1,
  });

  redirect(url);
}

export interface LicenseFormState {
  error?: string;
  ok?: string;
}

/**
 * Ändrar antalet licenser.
 *
 * Rutan stannar öppen vid fel — den vanligaste orsaken är att man försöker
 * sänka under antalet aktiva skärmar, och då behöver man läsa vad som gäller.
 */
export async function changeLicenses(
  _previous: LicenseFormState,
  formData: FormData
): Promise<LicenseFormState> {
  const session = await requireAdmin();
  const next = Number(formData.get("screens"));

  try {
    await changeLicenseCount(session.companyId, next);
  } catch (error) {
    if (error instanceof LicenseError) return { error: error.message };

    console.error("Kunde inte ändra antalet licenser", error);
    return {
      error:
        "Antalet kunde inte ändras. Försök igen, eller hör av dig om det står kvar.",
    };
  }

  revalidatePath("/admin/installningar/prenumeration");
  revalidatePath("/admin/skarmar");

  return { ok: `Ni har nu ${next} licenser.` };
}

export async function openBillingPortal() {
  const session = await requireAdmin();

  const url = await createPortalSession({
    companyId: session.companyId,
    baseUrl: await baseUrl(),
  });

  redirect(url);
}
