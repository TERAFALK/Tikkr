import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * SUPPORTSESSION — leverantören ser en kunds panel, i läsläge.
 *
 * Varför en EGEN cookie och inte kundens vanliga inloggning: lånade vi ett
 * `adminUser`-konto skulle kundens egen logg påstå att DE gjorde något. En
 * rättad post skulle stå som rättad av deras ägare, och den dag någon
 * ifrågasätter en faktura finns inget som visar att en utomstående varit inne.
 *
 * Sessionen bär i stället plattformskontots adress. Allt som skrivs ner under
 * besöket bär därmed rätt namn — och eftersom läget är läsning skrivs
 * ingenting alls, vilket är själva poängen.
 *
 * TRE SAKER SOM SKILJER DEN FRÅN PLATTFORMSSESSIONEN:
 *
 *   1. Den pekar ut ETT företag. En supportcookie ger aldrig åtkomst till
 *      nästa kund; man måste gå tillbaka och starta ett nytt besök.
 *   2. Den lever i trettio minuter, inte åtta timmar. En glömd flik ska inte
 *      ligga öppen mot en kunds personuppgifter över natten.
 *   3. Den ger LÄSNING. Spärren ligger i databaslagret, inte i gränssnittet —
 *      se forCompany(..., { readOnly: true }).
 *
 * De två cookiarna lever sida vid sida, så plattformspanelen ligger kvar i sin
 * flik medan kundens panel öppnas i en annan.
 */

const COOKIE = "tikkr_support";

/** Trettio minuter. Ett supportärende, inte en arbetsdag. */
const LIFETIME_SECONDS = 30 * 60;

export interface SupportSession {
  /** Kunden som ses. En cookie, ett företag. */
  companyId: string;
  /** Plattformskontots adress. Aldrig ett kundkonto. */
  email: string;
  /** Besökets id i support_visits, så att lastSeenAt går att uppdatera. */
  visitId: string;
  /** Utgångstid, sekunder sedan epoch. */
  exp: number;
}

/**
 * Nyckeln härleds ur AUTH_SECRET men är sin egen sträng.
 *
 * Samma skäl som för plattformssessionen: varken en kundsession eller en
 * plattformssession ska kunna råka valideras som en supportsession, utan att
 * vi behöver ännu en hemlighet att hålla reda på.
 */
function signingKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET saknas — supportläge kan inte köras.");
  }
  return `${secret}:support-session`;
}

function sign(data: string): string {
  return createHmac("sha256", signingKey()).update(data).digest("base64url");
}

function encode(payload: SupportSession): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): SupportSession | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);

  // Jämförelse som tar lika lång tid oavsett hur många tecken som stämmer.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as SupportSession;

    if (
      !payload.companyId ||
      !payload.email ||
      !payload.visitId ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp * 1000 < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function startSupportSession(input: {
  companyId: string;
  email: string;
  visitId: string;
}): Promise<void> {
  const payload: SupportSession = {
    companyId: input.companyId,
    email: input.email.toLowerCase(),
    visitId: input.visitId,
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

export async function endSupportSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Det pågående supportbesöket, eller null. */
export async function readSupportSession(): Promise<SupportSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  return decode(token);
}

// Exporteras för test. Signaturen är det som håller läget stängt, och den ska
// gå att kontrollera utan att starta en webbserver.
//
// `sign` ingår för att testerna ska kunna signera ETT EGET innehåll. Utan den
// går det bara att pröva att en trasig signatur avvisas — och ett test som faller
// på signaturen bevisar ingenting om kontrollen av fälten, fastän det ser ut att
// göra det.
export const __internals = { encode, decode, sign, LIFETIME_SECONDS, COOKIE };
