"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { createCompanyWithOwner, SignupError } from "@/lib/signup";
import { sendEmailVerification } from "@/lib/email-verification";
import { requestIp } from "@/lib/client-ip";
import { isLockedOut, noteFailedLogin } from "@/lib/login-throttle";

export interface SignupState {
  error?: string;
}

/**
 * TAK PÅ NYA ARBETSYTOR PER AVSÄNDARE (infört 2026-10-06).
 *
 * Registreringen var öppen utan gräns. Ett skript kunde skapa tusen företag i
 * minuten, var och ett med åtta frånvaroorsaker och ett bekräftelsemejl från
 * vår adress. Fem per kvart och IP-adress räcker för ett kontor där flera
 * provar samtidigt.
 *
 * Räknas med samma broms som inloggningen, fast varje registrering räknas och
 * inte bara de misslyckade.
 */
const SIGNUP_SCOPE = "signup-ip";
const SIGNUP_MAX_PER_WINDOW = 5;

export async function register(
  _previous: SignupState,
  formData: FormData
): Promise<SignupState> {
  // Fältet är dolt för människor och fylls bara i av skript som fyller i
  // allt de hittar. Svaret är medvetet tråkigt, så att skriptet inte lär sig
  // något av det.
  if (String(formData.get("website") ?? "").trim()) {
    return { error: "Registreringen gick inte igenom. Försök igen." };
  }

  const ip = await requestIp();
  if (ip && isLockedOut(SIGNUP_SCOPE, ip, SIGNUP_MAX_PER_WINDOW)) {
    return {
      error:
        "För många nya arbetsytor från den här adressen. Försök igen om en kvart.",
    };
  }

  const companyName = String(formData.get("companyName") ?? "");
  const ownerName = String(formData.get("ownerName") ?? "");
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password !== repeat) {
    return { error: "Lösenorden är inte lika." };
  }

  let ownerId: string;

  try {
    const { owner } = await createCompanyWithOwner({
      companyName,
      ownerName,
      email,
      phone,
      password,
    });
    ownerId = owner.id;
  } catch (error) {
    // SignupError bär ett meddelande skrivet för att läsas av en människa.
    if (error instanceof SignupError) return { error: error.message };
    throw error;
  }

  if (ip) noteFailedLogin(SIGNUP_SCOPE, ip);

  // Bekräftelsen spärrar ingenting och får inte stoppa registreringen. Går
  // mejlet inte iväg visar panelen en remsa med en knapp för att försöka igen.
  await sendEmailVerification(ownerId);

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
