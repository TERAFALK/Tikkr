"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import {
  createCheckoutSession,
  createPortalSession,
  startLicenseChange,
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
}

/**
 * Påbörjar en ändring av antalet licenser.
 *
 * Ändringen genomförs inte här, utan på Stripes bekräftelsesida där beloppet
 * står. Rutan stannar öppen vid fel — den vanligaste orsaken är ett försök att
 * sänka under antalet aktiva skärmar, och då behöver man läsa vad som gäller.
 */
export async function changeLicenses(
  _previous: LicenseFormState,
  formData: FormData
): Promise<LicenseFormState> {
  const session = await requireAdmin();
  const next = Number(formData.get("screens"));

  let url: string;

  try {
    url = await startLicenseChange({
      companyId: session.companyId,
      next,
      baseUrl: await baseUrl(),
    });
  } catch (error) {
    if (error instanceof LicenseError) return { error: error.message };

    console.error("Kunde inte påbörja ändring av antalet licenser", error);
    return {
      error:
        "Ändringen kunde inte påbörjas hos Stripe. Försök igen, eller kontakta support@tikkr.se om felet kvarstår.",
    };
  }

  // Ligger utanför try-blocket. redirect() avbryter genom att kasta, och hade
  // fångats som ett fel om den låg innanför.
  redirect(url);
}

export async function openBillingPortal() {
  const session = await requireAdmin();

  const url = await createPortalSession({
    companyId: session.companyId,
    baseUrl: await baseUrl(),
  });

  redirect(url);
}
