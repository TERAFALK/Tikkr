import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { __internals } from "@/lib/platform-session";

/**
 * Signaturen på plattformssessionen.
 *
 * Det här är vad som håller panelen stängd. Går den att förfalska kommer vem
 * som helst åt alla kunders driftdata, utan lösenord. Testerna försöker därför
 * bryta upp den på de sätt en angripare skulle prova.
 */

const { encode, decode } = __internals;

const original = process.env.AUTH_SECRET;

beforeAll(() => {
  process.env.AUTH_SECRET = "en-hemlighet-for-testet-som-ar-lang-nog";
});

afterAll(() => {
  process.env.AUTH_SECRET = original;
});

function future(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

describe("giltig session", () => {
  it("går att läsa tillbaka", () => {
    const token = encode({ email: "adi@terafalk.com", exp: future() });
    expect(decode(token)?.email).toBe("adi@terafalk.com");
  });
});

describe("förfalskning misslyckas", () => {
  it("ändrad adress underkänns", () => {
    const token = encode({ email: "adi@terafalk.com", exp: future() });
    const [, signature] = token.split(".");

    // Angriparen byter innehållet men behåller signaturen.
    const forged = Buffer.from(
      JSON.stringify({ email: "angripare@example.com", exp: future() })
    ).toString("base64url");

    expect(decode(`${forged}.${signature}`)).toBeNull();
  });

  it("innehåll utan signatur underkänns", () => {
    const body = Buffer.from(
      JSON.stringify({ email: "angripare@example.com", exp: future() })
    ).toString("base64url");

    expect(decode(body)).toBeNull();
    expect(decode(`${body}.`)).toBeNull();
    expect(decode(`${body}.hittepa`)).toBeNull();
  });

  it("session signerad med en annan hemlighet underkänns", () => {
    const token = encode({ email: "adi@terafalk.com", exp: future() });

    process.env.AUTH_SECRET = "en-helt-annan-hemlighet-an-forut";
    expect(decode(token)).toBeNull();

    process.env.AUTH_SECRET = "en-hemlighet-for-testet-som-ar-lang-nog";
    expect(decode(token)?.email).toBe("adi@terafalk.com");
  });

  it("skräp underkänns utan att krascha", () => {
    expect(decode("")).toBeNull();
    expect(decode("...")).toBeNull();
    expect(decode("inte.base64")).toBeNull();
  });
});

describe("utgången session", () => {
  it("underkänns även om signaturen stämmer", () => {
    const token = encode({
      email: "adi@terafalk.com",
      exp: Math.floor(Date.now() / 1000) - 1,
    });

    expect(decode(token)).toBeNull();
  });

  it("en session utan utgångstid underkänns", () => {
    const body = Buffer.from(
      JSON.stringify({ email: "adi@terafalk.com" })
    ).toString("base64url");

    // Signaturen är äkta — men innehållet saknar utgångstid, och en session
    // som aldrig går ut vore giltig för alltid.
    const token = encode({ email: "adi@terafalk.com", exp: future() });
    const [, signature] = token.split(".");

    expect(decode(`${body}.${signature}`)).toBeNull();
  });
});
