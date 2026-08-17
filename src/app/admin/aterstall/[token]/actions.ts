"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import {
  redeemPasswordReset,
  PasswordResetError,
} from "@/lib/password-reset";

export interface ResetState {
  error?: string;
}

/**
 * Sätter det nya lösenordet och loggar in direkt.
 *
 * Den som just bevisat att de når kontots inkorg har bevisat tillräckligt. Att
 * skicka dem till inloggningssidan för att skriva samma lösenord en gång till
 * är ett steg utan syfte.
 */
export async function setNewPassword(
  _previous: ResetState,
  formData: FormData
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password !== repeat) {
    return { error: "Lösenorden är inte lika." };
  }

  let email: string;

  try {
    const result = await redeemPasswordReset(token, password);
    email = result.email;
  } catch (error) {
    if (error instanceof PasswordResetError) return { error: error.message };
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/admin" });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          "Lösenordet är ändrat, men inloggningen misslyckades. Logga in med det nya lösenordet.",
      };
    }
    throw error;
  }

  return {};
}
