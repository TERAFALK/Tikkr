"use server";

import { redirect } from "next/navigation";
import { acceptInvite, AdminUserError } from "@/lib/admin-users";
import { issueTicket } from "@/lib/login-ticket";

export interface AcceptState {
  error?: string;
}

export async function acceptInvitation(
  _previous: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password !== repeat) {
    return { error: "Lösenorden är inte lika." };
  }

  let userId: string;

  try {
    const user = await acceptInvite(token, password, {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof AdminUserError) return { error: error.message };
    throw error;
  }

  // Lösenordet är just valt. Vidare till tvåstegsinloggningen, där QR-koden
  // visas, i stället för till e-post och lösenord en gång till.
  await issueTicket("admin", userId);
  redirect("/admin/login");
}
