import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * SESSION FÖR PLATTFORMSPANELEN.
 *
 * Helt skild från kundernas inloggning. Skälet är inte bara ordning: ett
 * plattformskonto ser alla kunders driftdata, och ska aldrig kunna förväxlas
 * med ett kundkonto av någon kod som kontrollerar behörighet.
 *
 * Sessionen är en signerad cookie. Vi sparar inga sessioner i databasen —
 * innehållet är bara en adress och en utgångstid, och signaturen gör att det
 * inte går att ändra. Enklare att förstå, och ingen tabell att städa i.
 *
 * Livslängden är kort med flit. En kundsession får gälla länge eftersom en
 * glömd utloggning där kostar lite; här kostar den allt.
 */

const COOKIE = "tikkr_platform";

/** Åtta timmar — en arbetsdag, sedan får man logga in igen. */
const LIFETIME_SECONDS = 8 * 60 * 60;

interface SessionPayload {
  email: string;
  /** Utgångstid, sekunder sedan epoch. */
  exp: number;
}

/**
 * Nyckeln härleds ur AUTH_SECRET men är inte samma sträng.
 *
 * Det gör att en kundsessionscookie aldrig kan råka valideras som en
 * plattformssession, utan att vi behöver ännu en hemlighet att hålla reda på.
 */
function signingKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET saknas — plattformsinloggning kan inte köras.");
  }
  return `${secret}:platform-session`;
}

function sign(data: string): string {
  return createHmac("sha256", signingKey()).update(data).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);

  // Jämförelse som tar lika lång tid oavsett hur många tecken som stämmer.
  // Annars går signaturen att gissa fram tecken för tecken.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as SessionPayload;

    if (!payload.email || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function startPlatformSession(email: string): Promise<void> {
  const payload: SessionPayload = {
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + LIFETIME_SECONDS,
  };

  (await cookies()).set(COOKIE, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LIFETIME_SECONDS,
  });
}

export async function endPlatformSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Adressen i en giltig session, eller null. */
export async function readPlatformSession(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  return decode(token)?.email ?? null;
}

// Exporteras för test. Signaturlogiken är det som håller panelen stängd, och
// den ska gå att kontrollera utan att starta en webbserver.
export const __internals = { encode, decode, LIFETIME_SECONDS };
