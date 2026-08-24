"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import {
  KIOSK_COOKIE,
  getKioskSession,
  kioskCookieOptions,
  redeemPairingCode,
  unpairDevice,
} from "@/lib/kiosk-auth";
import {
  clearFailedLogins,
  isLockedOut,
  noteFailedLogin,
} from "@/lib/login-throttle";

/**
 * KOPPLING AV EN SKÄRM.
 *
 * Sex siffror är en miljon kombinationer. Utan tak på antalet gissningar hittar
 * ett skript en giltig kod på några minuter, och skulle då koppla en egen
 * skärm till någon annans företag.
 *
 * Bromsen är därför inte en artighet utan det som gör kortkoden försvarbar. Den
 * räknas per avsändare, med samma spärr som inloggningarna använder: fem försök,
 * sedan femton minuters låsning.
 */
const THROTTLE_SCOPE = "kiosk-pairing";

export interface PairingState {
  error?: string;
  /** Namnet på skärmen som kopplades. Visas som bekräftelse. */
  pairedAs?: string;
}

/** Avsändarens adress, så gott den går att avgöra bakom en proxy. */
async function callerKey(): Promise<string> {
  const headerList = await headers();

  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "okänd"
  );
}

export async function pairDevice(
  _previous: PairingState,
  formData: FormData
): Promise<PairingState> {
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const key = await callerKey();

  if (isLockedOut(THROTTLE_SCOPE, key)) {
    return {
      error:
        "För många försök. Vänta femton minuter, eller be administratören om en ny kod.",
    };
  }

  if (code.length !== 6) {
    return { error: "Koden består av sex siffror." };
  }

  const result = await redeemPairingCode(code);

  if (!result) {
    noteFailedLogin(THROTTLE_SCOPE, key);

    // Medvetet knapphändigt. Ett svar som skiljer på "fel kod" och "utgången
    // kod" berättar för den som gissar att den var nära.
    return { error: "Koden gäller inte. Kontrollera siffrorna eller be om en ny." };
  }

  clearFailedLogins(THROTTLE_SCOPE, key);

  const jar = await cookies();
  jar.set(KIOSK_COOKIE, result.token, kioskCookieOptions());

  return { pairedAs: result.session.deviceName };
}

/**
 * Kopplar loss skärmen inifrån, via kugghjulet.
 *
 * Nollar token på servern och inte bara cookien. En cookie som bara raderas
 * lämnar en giltig token kvar i databasen.
 */
export async function unpairThisDevice(): Promise<void> {
  const session = await getKioskSession();

  const jar = await cookies();
  jar.delete(KIOSK_COOKIE);

  if (session) await unpairDevice(session.deviceId);

  // Sidan hämtar sitt läge på servern. Utan detta kan skärmen bli stående kvar
  // i stämplingsvyn trots att den inte längre är kopplad.
  revalidatePath("/kiosk");
}
