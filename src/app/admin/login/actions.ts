"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { checkAdminPassword } from "@/lib/admin-mfa";
import { requestIp } from "@/lib/client-ip";
import {
  clearTicket,
  issueTicket,
  rawTicket,
  readTicket,
} from "@/lib/login-ticket";
import type { TwoStepState } from "@/components/ui/TwoStepForm";

export interface LoginState {
  error?: string;
}

/**
 * Steg 1: e-post och lösenord.
 *
 * Ett rätt lösenord ger ingen session, bara en lapp som leder till steg två.
 * Sidan visar då QR-koden eller fältet för koden. Se login-ticket.ts.
 */
export async function login(
  _previous: LoginState,
  formData: FormData
): Promise<LoginState> {
  const result = await checkAdminPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    ip: await requestIp(),
  });

  // Medvetet samma meddelande oavsett om e-posten eller lösenordet var fel.
  // Annars går det att lista ut vilka adresser som finns.
  if (!result.ok) return { error: result.error };

  await issueTicket("admin", result.userId);

  // redirect kastar internt och måste ligga utanför try/catch.
  redirect("/admin/login");
}

/** Steg 2: koden från appen. Skapar sessionen när den stämmer. */
export async function confirmCode(
  _previous: TwoStepState,
  formData: FormData
): Promise<TwoStepState> {
  const ticket = await readTicket("admin");
  if (!ticket) redirect("/admin/login");

  try {
    // Utan omdirigering här, så att lappen kan tas bort innan personen går
    // vidare. En lapp som ligger kvar efter inloggningen gör ingen skada, men
    // den har inget kvar att göra.
    await signIn("credentials", {
      ticket: await rawTicket("admin"),
      code: String(formData.get("code") ?? ""),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          "Koden stämmer inte. Kontrollera att telefonens klocka går rätt och försök igen.",
      };
    }
    throw error;
  }

  await clearTicket("admin");
  redirect(ticket.next ?? "/admin");
}

/** Börja om från e-post och lösenord. */
export async function cancelLogin() {
  await clearTicket("admin");
  redirect("/admin/login");
}
