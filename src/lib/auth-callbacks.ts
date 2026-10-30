import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";

/**
 * CALLBACKARNA FÖR PANELENS SESSION, för sig så att de går att pröva utan
 * Next. Se auth.ts.
 *
 * INLOGGNINGSTIDEN ÄR `authTime`, ALDRIG `iat` (ändrat 2026-10-18).
 *
 * Auth.js signerar om sessionen varje gång `/api/auth/session` anropas, och
 * sätter då `iat` till nu. Återkallelsen prövades tidigare mot `iat`, så den
 * som hade en stulen cookie behövde bara göra ett anrop efter "Logga ut på
 * alla enheter" eller ett lösenordsbyte för att få en cookie som klarade
 * prövningen. `authTime` sätts bara när `user` finns, alltså vid själva
 * inloggningen, och följer sedan med oförändrad genom varje förnyelse.
 */

/** Sekunder sedan epoch. Samma enhet som Auth.js använder för `iat`. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function jwtCallback({ token, user }: { token: JWT; user?: User | null }): JWT {
  if (user) {
    token.companyId = user.companyId;
    token.companyName = user.companyName;
    token.role = user.role;
    token.mfaDeferred = user.mfaDeferred === true;
    token.authTime = nowSeconds();
  }
  return token;
}

export function sessionCallback({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Session {
  session.user.id = String(token.sub);
  session.user.companyId = String(token.companyId);
  session.user.companyName = String(token.companyName);
  session.user.role = String(token.role);

  // Saknas på sessioner från före 2026-10-18. currentAdmin() nekar dem, så
  // att en gammal cookie inte kan fortsätta förnyas med den gamla regeln.
  session.user.authTime =
    typeof token.authTime === "number" ? token.authTime : undefined;

  // Satt bara på den första sessionen efter en registrering. Se auth.ts.
  session.user.mfaDeferred = token.mfaDeferred === true;

  return session;
}
