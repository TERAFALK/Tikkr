"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";

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
  });

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
