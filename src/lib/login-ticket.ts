import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * BEVISET ATT LÖSENORDET ÄR KONTROLLERAT, mellan inloggningens två steg.
 *
 * Inloggningen sker i två steg sedan tvåstegsinloggningen blev obligatorisk
 * (2026-10-06): först e-post och lösenord, sedan koden från appen — eller
 * QR-koden, för den som inte satt upp appen än. Mellan stegen bär webbläsaren
 * den här lappen, som säger "lösenordet för det här kontot stämde, för en
 * stund sedan" och ingenting mer.
 *
 * Lappen ger INGEN åtkomst. Den riktiga sessionen skapas först när koden
 * godkänts, och koden prövas mot kontot lappen pekar ut. Utan lappen finns
 * inget steg två att komma till; med den måste man ändå ha telefonen.
 *
 * Signerad med en nyckel härledd ur AUTH_SECRET, och olika för kundernas och
 * plattformens inloggning, så att en lapp från den ena aldrig gäller i den
 * andra. Tio minuter, sedan börjar man om.
 *
 * Registrering, inbjudan och återställning av lösenord går samma väg: de
 * har just bevisat lösenordet och lämnar en lapp, och personen hamnar i steg
 * två i stället för inne i panelen.
 */

export type TicketScope = "admin" | "platform";

const COOKIE: Record<TicketScope, string> = {
  admin: "tikkr_inloggning",
  platform: "tikkr_plattform_inloggning",
};

const LIFETIME_SECONDS = 10 * 60;

export interface LoginTicket {
  /** Kontot: AdminUser.id för kunder, e-postadressen för plattformen. */
  sub: string;
  /** Vart personen ska efter steg två. Alltid en sökväg i appen. */
  next?: string;
  /**
   * Satt när lösenordet just återställts via mejl. Då räcker inte en kod via
   * e-post i steg två: den som kommit åt inkorgen hade annars både kunnat
   * byta lösenordet och ta emot koden. Se loginAlternatives i admin-mfa.ts.
   */
  afterReset?: boolean;
  /**
   * Satt när kontot just skapats vid registreringen (2026-10-11).
   *
   * Lappen är då beviset i stället för en kod från appen: lösenordet valdes
   * för några sekunder sedan, i den här webbläsaren, och kontot har ingen app
   * kopplad än. Se SIGNUP_METHOD i auth.ts, och § 4 punkt 5 i CLAUDE.md om
   * varför tvåsteg ändå krävs från andra inloggningen.
   *
   * Gäller bara tio minuter, som alla lappar, och kan inte förfalskas: den är
   * signerad med AUTH_SECRET.
   */
  fresh?: boolean;
  /** Utgångstid, sekunder sedan epoch. */
  exp: number;
}

/** Det som kan följa med utöver kontot och vägen vidare. */
export interface TicketExtra {
  afterReset?: boolean;
  fresh?: boolean;
}

function signingKey(scope: TicketScope): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET saknas.");
  return `${secret}:login-ticket:${scope}`;
}

function sign(scope: TicketScope, data: string): string {
  return createHmac("sha256", signingKey(scope)).update(data).digest("base64url");
}

/**
 * Bara en sökväg i samma app. En fullständig adress vore en öppen omdirigering.
 *
 * Bakåtsnedstreck och styrtecken vägras också (ändrat 2026-10-18): webbläsare
 * läser `/\evil.se` som `//evil.se`, alltså en annan sajt, och en tabb eller
 * radbrytning i adressen tas bort innan den tolkas.
 */
export function safeNext(next: string | undefined): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return undefined;
  return next;
}

/**
 * En returadress INOM ADMINPANELEN, eller undefined.
 *
 * Säljsidans Beställ-knapp skickar den som inte är inloggad till
 * inloggningen med `?till=/admin/...`, och personen ska landa där efter
 * tvåsteget. Adressen kommer utifrån, så den prövas som safeNext och måste
 * dessutom ligga under /admin: en inloggning ska inte kunna skicka vidare
 * till plattformspanelen eller tillbaka till inloggningen.
 */
export function safeAdminNext(next: string | undefined | null): string | undefined {
  const safe = safeNext(next ?? undefined);
  if (!safe) return undefined;
  if (safe !== "/admin" && !safe.startsWith("/admin/") && !safe.startsWith("/admin?")) {
    return undefined;
  }
  if (safe.startsWith("/admin/login")) return undefined;
  return safe;
}

export function encodeTicket(
  scope: TicketScope,
  sub: string,
  next?: string,
  now: Date = new Date(),
  extra: TicketExtra = {}
): string {
  const payload: LoginTicket = {
    sub,
    next: safeNext(next),
    exp: Math.floor(now.getTime() / 1000) + LIFETIME_SECONDS,
    ...(extra.afterReset ? { afterReset: true } : {}),
    ...(extra.fresh ? { fresh: true } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(scope, body)}`;
}

/** Lappens innehåll, eller null när den är förfalskad, trasig eller gammal. */
export function decodeTicket(
  scope: TicketScope,
  value: string | undefined,
  now: Date = new Date()
): LoginTicket | null {
  if (!value) return null;

  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(scope, body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as LoginTicket;

    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp * 1000 < now.getTime()) return null;

    return { ...payload, next: safeNext(payload.next) };
  } catch {
    return null;
  }
}

export async function issueTicket(
  scope: TicketScope,
  sub: string,
  next?: string,
  extra: TicketExtra = {}
): Promise<void> {
  (await cookies()).set(COOKIE[scope], encodeTicket(scope, sub, next, new Date(), extra), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LIFETIME_SECONDS,
  });
}

/** Lappen som den står i cookien, oavkodad. Skickas vidare till inloggningen. */
export async function rawTicket(scope: TicketScope): Promise<string | undefined> {
  return (await cookies()).get(COOKIE[scope])?.value;
}

export async function readTicket(scope: TicketScope): Promise<LoginTicket | null> {
  return decodeTicket(scope, await rawTicket(scope));
}

export async function clearTicket(scope: TicketScope): Promise<void> {
  (await cookies()).delete(COOKIE[scope]);
}
