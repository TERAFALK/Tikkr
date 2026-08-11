"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { createCompanyWithOwner, SignupError } from "@/lib/signup";

export interface SignupState {
  error?: string;
}

export async function register(
  _previous: SignupState,
  formData: FormData
): Promise<SignupState> {
  const companyName = String(formData.get("companyName") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password !== repeat) {
    return { error: "Lösenorden är inte lika." };
  }

  try {
    await createCompanyWithOwner({ companyName, email, password });
  } catch (error) {
    // SignupError bär ett meddelande skrivet för att läsas av en människa.
    if (error instanceof SignupError) return { error: error.message };
    throw error;
  }

  try {
    // Logga in direkt. Att tvinga någon att skriva lösenordet igen tio
    // sekunder efter att de valt det är bara ett hinder.
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/admin/kom-igang",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Kontot finns men inloggningen krånglade. Skicka dem till
      // inloggningssidan istället för att låtsas att inget hänt.
      return {
        error: "Kontot är skapat, men inloggningen misslyckades. Logga in nedan.",
      };
    }
    throw error;
  }

  return {};
}
