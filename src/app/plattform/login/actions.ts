"use server";

import { redirect } from "next/navigation";
import { checkPlatformPassword, verifyPlatformCode } from "@/lib/platform-auth";
import {
  endPlatformSession,
  startPlatformSession,
} from "@/lib/platform-session";
import { clearTicket, issueTicket, readTicket } from "@/lib/login-ticket";
import type { TwoStepState } from "@/components/ui/TwoStepForm";

export interface PlatformLoginState {
  error?: string;
}

/** Steg 1: adress och lösenord. Leder till QR-koden eller koden. */
export async function platformLogin(
  _previous: PlatformLoginState,
  formData: FormData
): Promise<PlatformLoginState> {
  const outcome = await checkPlatformPassword(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? "")
  );

  if (!outcome.ok || !outcome.email) {
    return { error: outcome.problem ?? "Inloggningen misslyckades." };
  }

  await issueTicket("platform", outcome.email);

  // redirect kastar internt och måste ligga utanför try/catch.
  redirect("/plattform/login");
}

/** Steg 2: koden från appen. Startar sessionen när den stämmer. */
export async function platformConfirmCode(
  _previous: TwoStepState,
  formData: FormData
): Promise<TwoStepState> {
  const ticket = await readTicket("platform");
  if (!ticket) redirect("/plattform/login");

  const outcome = await verifyPlatformCode(
    ticket.sub,
    String(formData.get("code") ?? "")
  );

  if (!outcome.ok || !outcome.email) {
    return { error: outcome.problem ?? "Inloggningen misslyckades." };
  }

  await clearTicket("platform");
  await startPlatformSession(outcome.email);
  redirect("/plattform");
}

/** Börja om från adress och lösenord. */
export async function platformCancelLogin() {
  await clearTicket("platform");
  redirect("/plattform/login");
}

export async function platformLogout() {
  await endPlatformSession();
  redirect("/plattform/login");
}
