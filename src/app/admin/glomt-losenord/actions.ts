"use server";

import { appUrl } from "@/lib/app-url";
import { requestIp } from "@/lib/client-ip";
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

  try {
    await requestPasswordReset({
      email,
      // ALDRIG ur anropet. Länken går i ett äkta mejl från oss, och en värd
      // som besökaren fick välja vore en väg att stjäla den. Se app-url.ts.
      baseUrl: appUrl(),
      // Sparas på begäran, så att ett ifrågasatt lösenordsbyte går att reda ut.
      ip: await requestIp(),
    });
  } catch (error) {
    // Ett fel här är vårt, inte besökarens. Det loggas, men kvittensen ändras
    // inte — annars skulle skillnaden i svar avslöja vilka adresser som finns.
    console.error("[losenordsaterstallning] Begäran misslyckades", error);
  }

  return { sent: true };
}
