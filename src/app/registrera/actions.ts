"use server";

import { redirect } from "next/navigation";
import { issueTicket } from "@/lib/login-ticket";
import {
  createCompanyWithOwner,
  SignupError,
  type SignupStep,
} from "@/lib/signup";
import { sendEmailVerification } from "@/lib/email-verification";
import { requestIp } from "@/lib/client-ip";
import { isLockedOut, noteFailedLogin } from "@/lib/login-throttle";

/**
 * Det användaren skrev, tillbaka till formuläret efter ett fel.
 *
 * LÖSENORDEN ÄR INTE MED. De skulle då stå som ett `value` i sidans HTML, och
 * ett lösenord i klartext i en DOM är ett lösenord som ligger i
 * webbläsarens minne längre än det behöver. Den som fått ett fel skriver om
 * dem; allt annat står kvar.
 */
export interface SignupValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
}

export interface SignupState {
  error?: string;
  /**
   * REACT NOLLSTÄLLER FORMULÄRET EFTER EN ÅTGÄRD, och det är därför de här
   * finns. Ett formulär som skickats med `action` återställs till fältens
   * `defaultValue` när åtgärden är klar; utan ekot vore ett felstavat
   * telefonnummer detsamma som att skriva om alla fem fälten.
   */
  values?: SignupValues;
  /**
   * Steget felet hör till, så att formuläret kan gå tillbaka till fältet det
   * handlar om. Se SignupStep i signup.ts.
   *
   * Tomt betyder att felet inte hör till ett fält — spärren mot för många
   * registreringar och fällan för skript. De står kvar där man är.
   */
  step?: SignupStep;
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
  const values: SignupValues = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
  };

  if (ip && isLockedOut(SIGNUP_SCOPE, ip, SIGNUP_MAX_PER_WINDOW)) {
    return {
      error:
        "För många nya arbetsytor från den här adressen. Försök igen om en kvart.",
      values,
    };
  }

  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password !== repeat) {
    // Steg 2 är lösenordets eget, se SignupStep.
    return { error: "Lösenorden är inte lika.", step: 2, values };
  }

  let ownerId: string;

  try {
    const { owner } = await createCompanyWithOwner({ ...values, password });
    ownerId = owner.id;
  } catch (error) {
    // SignupError bär ett meddelande skrivet för att läsas av en människa,
    // och numret på steget där fältet står.
    if (error instanceof SignupError) {
      return { error: error.message, step: error.step, values };
    }
    throw error;
  }

  if (ip) noteFailedLogin(SIGNUP_SCOPE, ip);

  // Bekräftelsen spärrar ingenting och får inte stoppa registreringen. Går
  // mejlet inte iväg visar panelen en remsa med en knapp för att försöka igen.
  await sendEmailVerification(ownerId);

  // Vidare till tvåstegsinloggningen, utan att skriva lösenordet igen: det
  // valdes för tio sekunder sedan. Inloggningssidan visar QR-koden, och efter
  // den första koden hamnar den nya ägaren i kom igång-guiden.
  await issueTicket("admin", ownerId, "/admin/kom-igang");
  redirect("/admin/login");
}
