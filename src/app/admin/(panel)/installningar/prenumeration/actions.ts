"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import {
  createCheckoutSession,
  createPortalSession,
  openLicenseUpdate,
} from "@/lib/billing";

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
 * Skickar vidare till Stripe, där antalet licenser ändras.
 *
 * Formuläret stannar kvar vid fel, så att orsaken går att läsa. Ett fel här är
 * nästan alltid en driftsak — Stripe svarar inte, eller saknar den
 * portalkonfiguration som krävs — och detaljerna hamnar i serverloggen.
 */
export async function changeLicenses(
  _previous: LicenseFormState
): Promise<LicenseFormState> {
  const session = await requireAdmin();

  let url: string;

  try {
    url = await openLicenseUpdate({
      companyId: session.companyId,
      baseUrl: await baseUrl(),
    });
  } catch (error) {
    // Felet skrivs ut i klartext och med ett sökbart prefix. Det som går fel
    // här är nästan alltid en inställning hos betaltjänsten, och då behöver
    // den som sköter driften kunna läsa orsaken utan att gissa.
    console.error(
      "[licensändring] Kunde inte öppna betaltjänstens sida:",
      error instanceof Error ? error.message : error
    );

    return {
      error:
        "Sidan för att ändra antalet kunde inte öppnas. Försök igen, eller kontakta support@tikkr.se om felet kvarstår.",
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
