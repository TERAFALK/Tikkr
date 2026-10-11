"use server";

import { redirect } from "next/navigation";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import {
  changeUnverifiedEmail,
  EmailVerificationError,
  sendEmailVerification,
} from "@/lib/email-verification";
import { saved, type SaveState } from "@/lib/save-state";

/**
 * SPÄRRSIDANS EGNA ÅTGÄRDER.
 *
 * Samma två saker som remsan och Ditt konto gör, men de kan inte lånas rakt
 * av: båda skickar tillbaka till `/admin/konto`, och den sidan ligger bakom
 * spärren. Den som tryckt "Skicka igen" hade då bara sett spärren igen, utan
 * besked om att mejlet gått iväg.
 *
 * Logiken är ändå densamma, eftersom den bor i `email-verification.ts`. Det
 * som skiljer är vart man kommer efteråt.
 */

const PATH = "/admin/bekrafta-adressen";

/** Skickar bekräftelselänken på nytt. */
export async function resendVerification() {
  const session = await requireAdmin();
  await assertWritable(session);

  const outcome = await sendEmailVerification(session.userId);

  // Utfallet läses ur adressen. Ett formulär utan svar hade sett ut som en
  // knapp som inte gör något.
  redirect(`${PATH}?utskick=${outcome}`);
}

/**
 * Rättar adressen och skickar en ny länk dit.
 *
 * DEN HÄR ÄR SJÄLVA SKÄLET ATT SPÄRREN HAR EN EGEN SIDA. Skriver man fel på
 * sin e-postadress vid registreringen når man ingen länk, och utan en väg att
 * rätta adressen härifrån vore arbetsytan omöjlig att komma in i. Lösenordet
 * krävs, se changeUnverifiedEmail.
 */
export async function changeEmail(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);

  try {
    await changeUnverifiedEmail({
      userId: session.userId,
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (error) {
    if (error instanceof EmailVerificationError) return { error: error.message };
    throw error;
  }

  await sendEmailVerification(session.userId);

  return saved("Adressen är ändrad. En ny länk är skickad");
}
