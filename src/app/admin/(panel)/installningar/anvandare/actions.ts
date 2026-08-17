"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
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
    const headerList = await headers();
    const host =
      headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
    const proto = headerList.get("x-forwarded-proto") ?? "https";

    const result = await sendEmail(
      adminInviteEmail({
        to: invite.email,
        link: `${proto}://${host}/admin/inbjudan/${invite.token}`,
        companyName: session.companyName,
        invitedByEmail: session.email,
        daysValid: INVITE_DAYS,
      })
    );

    if (!result.delivered && result.provider !== "log") {
      console.error(
        `[inbjudan] Mejlet till ${invite.email} gick inte fram: ` +
          `${result.problem ?? "okänd orsak"}`
      );
    }

    // Adressen byggs inte här — serveråtgärder ser inte vilken adress
    // besökaren använder. Sidan sätter ihop den fullständiga länken.
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

  await revokeInvite({
    companyId: session.companyId,
    actingRole: session.role,
    inviteId: String(formData.get("inviteId") ?? ""),
  });

  revalidatePath(PATH);
}
