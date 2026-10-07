"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { checkAdminPassword, sendEmailLoginCode } from "@/lib/admin-mfa";
import { requestIp } from "@/lib/client-ip";
import {
  clearTicket,
  encodeTicket,
  issueTicket,
  rawTicket,
  readTicket,
} from "@/lib/login-ticket";
import {
  deviceCookie,
  isTrustedDevice,
  rememberDevice,
} from "@/lib/trusted-device";
import type { TwoStepState } from "@/components/ui/TwoStepForm";

export interface LoginState {
  error?: string;
}

/**
 * Steg 1: e-post och lösenord.
 *
 * Ett rätt lösenord ger ingen session, bara en lapp som leder till steg två.
 * Sidan visar då QR-koden eller fältet för koden. Se login-ticket.ts.
 *
 * Undantaget är en dator personen bett oss komma ihåg (trusted-device.ts).
 * Där räcker lösenordet, och sessionen skapas direkt.
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

  const device = await deviceCookie();
  if (await isTrustedDevice(device, result.userId)) {
    let signedIn = false;
    try {
      // Lappen skickas direkt och läggs aldrig i en cookie: den behövs bara
      // för att inloggningen ska veta att lösenordet just kontrollerats.
      await signIn("credentials", {
        ticket: encodeTicket("admin", result.userId),
        method: "device",
        device,
        redirect: false,
      });
      signedIn = true;
    } catch (error) {
      // Datorn godtogs inte ändå, till exempel efter ett lösenordsbyte i
      // samma ögonblick. Då blir det steg två som vanligt.
      if (!(error instanceof AuthError)) throw error;
    }
    // redirect kastar internt och måste ligga utanför try/catch.
    if (signedIn) redirect("/admin");
  }

  await issueTicket("admin", result.userId);
  redirect("/admin/login");
}

/**
 * Steg 2: koden, från appen eller via e-post. Skapar sessionen när den
 * stämmer, och kommer ihåg datorn om rutan är ikryssad.
 */
export async function confirmCode(
  _previous: TwoStepState,
  formData: FormData
): Promise<TwoStepState> {
  const ticket = await readTicket("admin");
  if (!ticket) redirect("/admin/login");

  const method = formData.get("method") === "email" ? "email" : "app";

  try {
    // Utan omdirigering här, så att lappen kan tas bort innan personen går
    // vidare. En lapp som ligger kvar efter inloggningen gör ingen skada, men
    // den har inget kvar att göra.
    await signIn("credentials", {
      ticket: await rawTicket("admin"),
      code: String(formData.get("code") ?? ""),
      method,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          method === "email"
            ? "Koden stämmer inte eller har gått ut. Skicka en ny kod och försök igen."
            : "Koden stämmer inte. Kontrollera att telefonens klocka går rätt och försök igen.",
      };
    }
    throw error;
  }

  if (formData.get("remember") === "on") await rememberDevice(ticket.sub);

  await clearTicket("admin");
  redirect(ticket.next ?? "/admin");
}

/** Inloggningsalternativet: skickar en kod till kontots bekräftade adress. */
export async function sendEmailCode() {
  const ticket = await readTicket("admin");
  if (!ticket) redirect("/admin/login");

  const outcome = await sendEmailLoginCode(ticket.sub, ticket.afterReset === true);

  if (outcome === "unavailable") redirect("/admin/login?alternativ=1");
  redirect(`/admin/login?metod=epost&utskick=${outcome}`);
}

/** Börja om från e-post och lösenord. */
export async function cancelLogin() {
  await clearTicket("admin");
  redirect("/admin/login");
}
