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
import { resolveAppUrl } from "@/lib/app-url";
import { normalizePhone } from "@/lib/phone";
import { saved, type SaveState } from "@/lib/save-state";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import {
  AdminUserError,
  INVITE_DAYS,
  inviteAdmin,
  removeAdmin,
  revokeInvite,
} from "@/lib/admin-users";
import { sendEmail } from "@/lib/email";
import { adminInviteEmail } from "@/lib/emails";

const PATH = "/admin/installningar/anvandare";

export interface InviteState {
  error?: string;
  /** Länken visas en enda gång, direkt efter att den skapats. */
  link?: string;
  email?: string;
  /** true när inbjudan också gick iväg som mejl. */
  mailed?: boolean;
}

export async function createInvite(
  _previous: InviteState,
  formData: FormData
): Promise<InviteState> {
  const session = await requireAdmin();
  await assertWritable(session);

  const email = String(formData.get("email") ?? "");
  const asRole = String(formData.get("role") ?? "ADMIN") === "OWNER"
    ? "OWNER"
    : "ADMIN";

  try {
    const invite = await inviteAdmin({
      companyId: session.companyId,
      role: session.role,
      invitedByEmail: session.email,
      email,
      asRole,
    });

    revalidatePath(PATH);

    // Mejlet är den vanliga vägen. Länken visas ändå i panelen — går utskicket
    // inte fram ska inbjudan inte vara omöjlig att slutföra, och den som bjuder
    // in ska kunna skicka den på annat sätt.
    //
    // Adressen i mejlet kommer ur inställningen och aldrig ur anropet, se
    // app-url.ts. Saknas inställningen skickas inget mejl; länken i panelen
    // fungerar ändå.
    const base = resolveAppUrl(process.env);

    const result = base
      ? await sendEmail(
          adminInviteEmail({
            to: invite.email,
            link: `${base}/admin/inbjudan/${invite.token}`,
            companyName: session.companyName,
            invitedByEmail: session.email,
            daysValid: INVITE_DAYS,
          })
        )
      : { delivered: false, provider: "none", problem: "APP_URL saknas i .env." };

    if (!result.delivered && result.provider !== "log") {
      console.error(
        `[inbjudan] Mejlet till ${invite.email} gick inte fram: ` +
          `${result.problem ?? "okänd orsak"}`
      );
    }

    // Sökvägen och inte hela adressen. Sidan sätter ihop länken med samma
    // inställning som mejlet använder.
    return {
      link: `/admin/inbjudan/${invite.token}`,
      email: invite.email,
      mailed: result.delivered,
    };
  } catch (error) {
    if (error instanceof AdminUserError) return { error: error.message };
    throw error;
  }
}

export async function deleteAdmin(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);

  try {
    await removeAdmin({
      companyId: session.companyId,
      actingUserId: session.userId,
      actingRole: session.role,
      actingEmail: session.email,
      targetUserId: String(formData.get("userId") ?? ""),
    });
  } catch (error) {
    if (error instanceof AdminUserError) return;
    throw error;
  }

  revalidatePath(PATH);
}

export async function cancelInvite(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);

  await revokeInvite({
    companyId: session.companyId,
    actingRole: session.role,
    inviteId: String(formData.get("inviteId") ?? ""),
  });

  revalidatePath(PATH);
}

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
