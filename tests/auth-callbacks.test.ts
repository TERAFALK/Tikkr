import { describe, it, expect } from "vitest";
import { decode, encode } from "@auth/core/jwt";
import type { Session } from "next-auth";
import { jwtCallback, sessionCallback } from "@/lib/auth-callbacks";

/**
 * INLOGGNINGSTIDEN ÖVERLEVER EN FÖRNYELSE (2026-10-18).
 *
 * Felet som fälldes: återkallelsen prövades mot `iat`, och Auth.js sätter om
 * `iat` varje gång `/api/auth/session` signerar om sessionen. Den som hade en
 * stulen cookie kunde därför göra ett anrop efter "Logga ut på alla enheter"
 * och få en cookie som klarade prövningen.
 *
 * Testet gör samma sak som `/api/auth/session`: läser token, kör
 * jwt-callbacken utan användare och signerar om. Inget nät och ingen databas,
 * bara Auth.js egna funktioner.
 */

const secret = "testhemlighet-for-callbacktestet-0123456789";
const salt = "authjs.session-token";

const user = {
  id: "konto-1",
  companyId: "foretag-1",
  companyName: "Testverkstan",
  role: "OWNER",
  mfaDeferred: false,
};

/** Det `/api/auth/session` gör med en befintlig cookie. */
async function refresh(cookie: string): Promise<string> {
  const payload = await decode({ token: cookie, secret, salt });
  if (!payload) throw new Error("Token gick inte att läsa.");
  return encode({ token: jwtCallback({ token: payload }), secret, salt });
}

describe("inloggningstiden", () => {
  it("sätts vid inloggningen", async () => {
    const token = jwtCallback({ token: { sub: user.id }, user });

    expect(typeof token.authTime).toBe("number");
  });

  it("ändras inte när sessionen förnyas, fast `iat` gör det", async () => {
    const signedIn = jwtCallback({ token: { sub: user.id }, user });
    // Inloggningen låg för ett dygn sedan.
    signedIn.authTime = Math.floor(Date.now() / 1000) - 24 * 3600;

    const cookie = await encode({ token: signedIn, secret, salt });
    const renewed = await decode({ token: await refresh(cookie), secret, salt });

    expect(renewed?.authTime).toBe(signedIn.authTime);
    // Det här är skälet att `iat` inte går att pröva mot: den är nu.
    expect(renewed?.iat).toBeGreaterThan(signedIn.authTime!);
  });

  it("följer med till sessionen", () => {
    const token = jwtCallback({ token: { sub: user.id }, user });
    const session = sessionCallback({
      session: { user: {}, expires: "" } as unknown as Session,
      token,
    });

    expect(session.user.authTime).toBe(token.authTime);
    expect(session.user.companyId).toBe(user.companyId);
  });

  it("saknas på en token från före ändringen", () => {
    const session = sessionCallback({
      session: { user: {}, expires: "" } as unknown as Session,
      token: { sub: user.id, iat: Math.floor(Date.now() / 1000) },
    });

    expect(session.user.authTime).toBeUndefined();
  });
});
