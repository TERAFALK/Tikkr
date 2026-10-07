"use server";

import { redirect } from "next/navigation";
import { issueTicket } from "@/lib/login-ticket";
import {
  redeemPasswordReset,
  PasswordResetError,
} from "@/lib/password-reset";

export interface ResetState {
  error?: string;
}

/**
 * Sätter det nya lösenordet och går vidare till tvåstegsinloggningen.
 *
 * Den som just bevisat att de når kontots inkorg har bevisat lösenordet, och
 * får inte skriva det en gång till. Koden från appen krävs ändå: en inkorg
 * som någon annan kommit åt ska inte räcka för att komma in i panelen.
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

  let userId: string;

  try {
    const result = await redeemPasswordReset(token, password);
    userId = result.userId;
  } catch (error) {
    if (error instanceof PasswordResetError) return { error: error.message };
    throw error;
  }

  // Märkt som efter en återställning: steg två kräver då koden från appen,
  // inte en kod via e-post. Se LoginTicket.afterReset.
  await issueTicket("admin", userId, undefined, { afterReset: true });
  redirect("/admin/login");
}
