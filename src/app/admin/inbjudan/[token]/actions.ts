"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { acceptInvite, AdminUserError } from "@/lib/admin-users";

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

  let email: string;

  try {
    const user = await acceptInvite(token, password);
    email = user.email;
  } catch (error) {
    if (error instanceof AdminUserError) return { error: error.message };
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/admin" });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Kontot är skapat, men inloggningen misslyckades. Logga in nedan.",
      };
    }
    throw error;
  }

  return {};
}
