"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function login(
  _previous: LoginState,
  formData: FormData
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/admin",
    });

    return {};
  } catch (error) {
    // Lyckad inloggning skickar vidare genom att kasta ett internt fel. Det
    // måste få passera — fångar vi det stannar användaren kvar på sidan.
    if (error instanceof AuthError) {
      // Medvetet samma meddelande oavsett om e-posten eller lösenordet var
      // fel. Annars går det att lista ut vilka adresser som finns.
      return { error: "Fel e-postadress eller lösenord." };
    }
    throw error;
  }
}
