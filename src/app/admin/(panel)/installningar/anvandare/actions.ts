"use server";

import { revalidatePath } from "next/cache";
import { resolveAppUrl } from "@/lib/app-url";
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
