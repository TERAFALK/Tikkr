"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requestIp } from "@/lib/client-ip";
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
 * har två lager:
 *
 *   1. Per avsändare: fem försök, sedan femton minuters låsning. Adressen tas
 *      ur det vår proxy skrev, inte ur det klienten påstår — se client-ip.ts.
 *   2. För hela installationen: koderna är gemensamma för alla kunder, så den
 *      som gissar från tusen adresser gissar mot samma miljon. Ett tak på
 *      misslyckade försök totalt gör att även det tar slut. Riktiga
 *      kopplingar sker några gånger i veckan och märker inget av det; under
 *      ett angrepp får admin vänta en kvart, vilket är rätt pris.
 */
const THROTTLE_SCOPE = "kiosk-pairing";
const GLOBAL_SCOPE = "kiosk-pairing-global";
const GLOBAL_KEY = "*";
const GLOBAL_MAX_FAILURES = 100;

export interface PairingState {
  error?: string;
  /** Namnet på skärmen som kopplades. Visas som bekräftelse. */
  pairedAs?: string;
}

export async function pairDevice(
  _previous: PairingState,
  formData: FormData
): Promise<PairingState> {
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const key = (await requestIp()) ?? "okänd";

  if (
    isLockedOut(THROTTLE_SCOPE, key) ||
    isLockedOut(GLOBAL_SCOPE, GLOBAL_KEY, GLOBAL_MAX_FAILURES)
  ) {
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
    noteFailedLogin(GLOBAL_SCOPE, GLOBAL_KEY);

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
