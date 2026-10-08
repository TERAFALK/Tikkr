"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { issueTicket } from "@/lib/login-ticket";
import { AccountError, changeOwnPassword, revokeOwnSessions } from "@/lib/account";
import {
  changeUnverifiedEmail,
  EmailVerificationError,
  sendEmailVerification,
} from "@/lib/email-verification";
import { normalizePhone } from "@/lib/phone";
import { saved, type SaveState } from "@/lib/save-state";
import { assertWritable, requireAdmin } from "@/lib/admin-session";

/**
 * DET EGNA KONTOT: namn, telefon, e-postadress och lösenord.
 *
 * Skilt från anvandare/actions.ts, som handlar om vilka ANDRA som har
 * åtkomst. De två låg i samma fil och på samma sida, och sidan blev därmed
 * två sidor i en: "mina uppgifter" överst och "vilka jobbar här" under.
 *
 * Varje åtgärd här tar sitt id ur sessionen och aldrig ur formuläret. Ingen
 * administratör ska kunna skriva in ett telefonnummer åt någon annan, och ett
 * id i ett fält är ett id någon kan byta ut.
 */

const PATH = "/admin/konto";

/**
 * Ändrar namn och telefonnummer på det EGNA kontot.
 *
 * Bara det egna: uppgifterna är personens, och ingen annan administratör ska
 * kunna skriva in ett nummer åt någon. Id:t tas därför ur sessionen och aldrig
 * ur formuläret.
 *
 * En ägare kan inte tömma sitt nummer. Det är så vi når arbetsytan när något
 * rör kontot eller betalningen, och en ägare utan nummer går inte att ringa.
 */
export async function saveOwnProfile(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);

  const name = String(formData.get("name") ?? "").trim();
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;

  if (rawPhone && !phone) return { error: "Kontrollera telefonnumret." };

  if (session.role === "OWNER") {
    if (name.length < 2) return { error: "Ange ditt namn." };
    if (!phone) return { error: "Ange ett telefonnummer." };
  }

  await session.db.adminUser.updateMany({
    where: { id: session.userId },
    data: { name: name || null, phone },
  });

  revalidatePath(PATH);
  return saved("Uppgifterna är sparade");
}

/**
 * Byter lösenord på det egna kontot och loggar in på nytt.
 *
 * Alla andra inloggningar slutar gälla i samma stund, se account.ts. Den
 * egna loggas in igen med det nya lösenordet, så att den som just bytt inte
 * kastas ut av sin egen ändring.
 */
export async function changePassword(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (next !== repeat) return { error: "Lösenorden är inte lika." };

  try {
    await changeOwnPassword({ userId: session.userId, current, next });
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message };
    throw error;
  }

  // Bytet avslutar alla sessioner, den här inräknad. Lösenordet är just
  // bevisat, så personen hamnar direkt på koden från appen och sedan här igen.
  await issueTicket("admin", session.userId, PATH);
  redirect("/admin/login");
}

/**
 * Loggar ut det egna kontot på alla enheter, den här inräknad.
 *
 * För den som glömt logga ut på en dator någon annan använder, eller
 * misstänker att någon annan är inne.
 */
export async function logoutEverywhere() {
  const session = await requireAdmin();
  await assertWritable(session);

  await revokeOwnSessions(session.userId);
  await signOut({ redirectTo: "/admin/login" });
}

/** Skickar bekräftelselänken på nytt, från remsan i panelen. */
export async function resendVerification() {
  const session = await requireAdmin();
  await assertWritable(session);

  const outcome = await sendEmailVerification(session.userId);

  // Remsan läser utfallet ur adressen. Ett formulär utan svar hade sett ut
  // som en knapp som inte gör något.
  redirect(`${PATH}?bekraftelse=${outcome}`);
}

/**
 * Rättar en obekräftad e-postadress och skickar en ny länk dit.
 *
 * Se changeUnverifiedEmail för varför bara en obekräftad adress går att byta
 * här, och varför lösenordet krävs.
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

  revalidatePath("/admin", "layout");
  return saved("Adressen är ändrad. En ny länk är skickad");
}
