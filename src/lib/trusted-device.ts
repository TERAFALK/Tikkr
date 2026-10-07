import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { unsafeGlobalPrisma } from "./db";

/**
 * "KOM IHÅG DEN HÄR DATORN" (infört 2026-10-07).
 *
 * Tvåstegsinloggningen är obligatorisk, och pilotkunden tyckte att koden var
 * jobbig. Den som kryssar i rutan i kodsteget slipper koden på den datorn i
 * 30 dagar. Lösenordet krävs fortfarande när sessionen gått ut (sju dagar),
 * så på en egen dator blir det lösenord en gång i veckan och kod en gång i
 * månaden. Samma nivå som Microsoft och Google.
 *
 * INGEN TABELL. Cookien bär kontot och när den utfärdades, signerad med en
 * nyckel ur AUTH_SECRET, och prövas mot kontots två tidpunkter för
 * återkallelse: lösenordsbytet och "Logga ut på alla enheter". Alla tre
 * vägarna som ska stänga en ihågkommen dator flyttar redan en av dem — ett
 * nytt lösenord, en utloggning överallt och en nollställd tvåstegsinloggning
 * (som sätter sessionsRevokedAt). Det finns alltså ingenting att komma ihåg
 * att städa.
 *
 * Bara för kundernas panel. Plattformspanelen ser alla kunder och kräver
 * koden vid varje inloggning.
 */

const COOKIE = "tikkr_betrodd_enhet";

/** 30 dagar. */
export const TRUSTED_DEVICE_DAYS = 30;
const LIFETIME_SECONDS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60;

interface DevicePayload {
  /** AdminUser.id */
  sub: string;
  /** Utfärdad, sekunder sedan epoch. Jämförs med kontots återkallelser. */
  iat: number;
  exp: number;
}

function sign(data: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET saknas.");
  return createHmac("sha256", `${secret}:trusted-device`)
    .update(data)
    .digest("base64url");
}

export function encodeDevice(userId: string, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: DevicePayload = { sub: userId, iat, exp: iat + LIFETIME_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Innehållet, eller null när cookien är förfalskad, trasig eller gammal. */
export function decodeDevice(
  value: string | undefined,
  now: Date = new Date()
): DevicePayload | null {
  if (!value) return null;

  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as DevicePayload;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 < now.getTime()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * true när cookien gäller just det här kontot och inte återkallats sedan den
 * utfärdades.
 */
export async function isTrustedDevice(
  value: string | undefined,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const device = decodeDevice(value, now);
  if (!device || device.sub !== userId) return false;

  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: userId },
    select: {
      totpEnabledAt: true,
      passwordChangedAt: true,
      sessionsRevokedAt: true,
    },
  });

  // Utan uppsatt app finns ingen tvåstegsinloggning att hoppa över.
  if (!user?.totpEnabledAt) return false;

  // Utfärdandetiden är avrundad till hela sekunder, som sessionens. Samma
  // marginal på en sekund som i currentAdmin().
  const issued = device.iat * 1000;
  for (const cutoff of [user.passwordChangedAt, user.sessionsRevokedAt]) {
    if (cutoff && issued < cutoff.getTime() - 1000) return false;
  }

  return true;
}

export async function rememberDevice(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, encodeDevice(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LIFETIME_SECONDS,
  });
}

export async function deviceCookie(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}
