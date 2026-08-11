"use server";

import { redirect } from "next/navigation";
import { verifyPlatformLogin } from "@/lib/platform-auth";
import {
  endPlatformSession,
  startPlatformSession,
} from "@/lib/platform-session";

export interface PlatformLoginState {
  error?: string;
}

export async function platformLogin(
  _previous: PlatformLoginState,
  formData: FormData
): Promise<PlatformLoginState> {
  const outcome = await verifyPlatformLogin(
    String(formData.get("email") ?? ""),
    String(formData.get("password") ?? "")
  );

  if (!outcome.ok || !outcome.email) {
    return { error: outcome.problem ?? "Inloggningen misslyckades." };
  }

  await startPlatformSession(outcome.email);

  // redirect kastar internt och måste ligga utanför try/catch.
  redirect("/plattform");
}

export async function platformLogout() {
  await endPlatformSession();
  redirect("/plattform/login");
}
