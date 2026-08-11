"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import {
  AdminUserError,
  inviteAdmin,
  removeAdmin,
  revokeInvite,
} from "@/lib/admin-users";

const PATH = "/admin/installningar/anvandare";

export interface InviteState {
  error?: string;
  /** Länken visas en enda gång, direkt efter att den skapats. */
  link?: string;
  email?: string;
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

    // Adressen byggs inte här — serveråtgärder ser inte vilken adress
    // besökaren använder. Sidan sätter ihop den fullständiga länken.
    return {
      link: `/admin/inbjudan/${invite.token}`,
      email: invite.email,
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
