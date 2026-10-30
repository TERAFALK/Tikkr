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
import { isLockedOut, noteFailedLogin } from "@/lib/login-throttle";

/**
 * KOPPLING AV EN SKÄRM.
 *
 * Sex siffror är en miljon kombinationer. Utan tak på antalet gissningar hittar
 * ett skript en giltig kod på några minuter, och skulle då koppla en egen
 * skärm till någon annans företag.
 *
 * Bromsen är därför inte en artighet utan det som gör kortkoden försvarbar:
 * fem försök per avsändare, sedan femton minuters låsning. Adressen tas ur det
 * vår proxy skrev, inte ur det klienten påstår — se client-ip.ts. Räkningen
 * ligger i databasen och överlever en omstart, se login-throttle.ts.
 *
 * INGEN GEMENSAM SPÄRR (borttagen 2026-10-18, produktägarens beslut). Ett tak
 * för hela installationen, hundra fel per kvart, gjorde att vem som helst kunde
 * stänga skärmkopplingen för alla kunder med ett skript mot /kiosk. Priset är
 * uttryckligt: den som gissar från många adresser samtidigt får fem gissningar
 * per adress och kvart, mot de koder som råkar vara giltiga just då. En kod
 * gäller i fem minuter.
 *
 * EN LYCKAD KOPPLING NOLLSTÄLLER INTE RÄKNAREN (ändrat 2026-10-30,
 * säkerhetsgranskningen). Vem som helst kan skapa en arbetsyta och få egna
 * giltiga koder, och varje sådan kod gav fem nya gissningar mot andra kunders.
 * Räkningen löper ut av sig själv en kvart efter senaste felet. Priset är att
 * den som sätter upp flera skärmar och skriver fel fem gånger får vänta.
 */
const THROTTLE_SCOPE = "kiosk-pairing";

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

  if (await isLockedOut(THROTTLE_SCOPE, key)) {
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
    await noteFailedLogin(THROTTLE_SCOPE, key);

    // Medvetet knapphändigt. Ett svar som skiljer på "fel kod" och "utgången
    // kod" berättar för den som gissar att den var nära.
    return { error: "Koden gäller inte. Kontrollera siffrorna eller be om en ny." };
  }

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
