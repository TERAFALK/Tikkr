"use server";

import { headers } from "next/headers";
import { requestPasswordReset } from "@/lib/password-reset";

export interface ForgotPasswordState {
  sent?: boolean;
  error?: string;
}

/**
 * Begär en återställningslänk.
 *
 * Kvittensen är densamma oavsett om adressen finns eller inte. Ett formulär
 * som svarar "adressen finns inte" är ett sätt att kartlägga vilka företag som
 * är kunder — utan inloggning, och utan att lämna spår som ser ut som ett
 * intrångsförsök.
 */
export async function requestReset(
  _previous: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");

  if (!email.trim()) {
    return { error: "Ange e-postadressen till ditt konto." };
  }

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";

  try {
    await requestPasswordReset({
      email,
      baseUrl: `${proto}://${host}`,
      // Sparas på begäran, så att ett ifrågasatt lösenordsbyte går att reda ut.
      ip:
        headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headerList.get("x-real-ip"),
    });
  } catch (error) {
    // Ett fel här är vårt, inte besökarens. Det loggas, men kvittensen ändras
    // inte — annars skulle skillnaden i svar avslöja vilka adresser som finns.
    console.error("[losenordsaterstallning] Begäran misslyckades", error);
  }

  return { sent: true };
}
