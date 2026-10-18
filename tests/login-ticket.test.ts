import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { encodeTicket, decodeTicket, safeNext } from "@/lib/login-ticket";

/**
 * LAPPEN MELLAN STEG ETT OCH STEG TVÅ I INLOGGNINGEN.
 *
 * Den bär vem som klarat lösenordet, och sedan 2026-10-11 också `fresh`, som
 * säger att kontot just registrerats. Det märket är det enda som släpper
 * igenom en inloggning UTAN kod från autentiseringsappen, se auth.ts, och
 * därför prövas här att det inte går att ljuga ihop ett.
 *
 * Behöver ingen databas och går därför att köra på laptopen, se CLAUDE.md
 * § 9. Nycklarna är testets egna.
 */

const original = process.env.AUTH_SECRET;

beforeAll(() => {
  process.env.AUTH_SECRET = "testhemlighet-for-lappen";
});

afterAll(() => {
  process.env.AUTH_SECRET = original;
});

describe("lappen bär sitt innehåll fram och tillbaka", () => {
  it("kontot och vägen vidare följer med", () => {
    const ticket = decodeTicket(
      "admin",
      encodeTicket("admin", "anv123", "/admin/rapporter")
    );

    expect(ticket?.sub).toBe("anv123");
    expect(ticket?.next).toBe("/admin/rapporter");
  });

  it("en fullständig adress som väg vidare kastas", () => {
    // En öppen omdirigering: lappen ska inte kunna skicka någon till en
    // annan webbplats efter inloggningen.
    const ticket = decodeTicket(
      "admin",
      encodeTicket("admin", "anv123", "https://nagon-annan.example")
    );

    expect(ticket?.next).toBeUndefined();
  });

  it("vägar som webbläsaren läser som en annan sajt kastas", () => {
    // `/\evil.example` blir `//evil.example` i webbläsaren, och en tabb eller
    // radbrytning tas bort innan adressen tolkas (2026-10-18).
    for (const next of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example"]) {
      expect(safeNext(next)).toBeUndefined();
    }
  });

  it("en vanlig väg i appen står kvar", () => {
    expect(safeNext("/admin/konto?ruta=tvasteg")).toBe("/admin/konto?ruta=tvasteg");
  });
});

describe("märket för en nyss registrerad arbetsyta", () => {
  it("följer med när registreringen satt det", () => {
    const ticket = decodeTicket(
      "admin",
      encodeTicket("admin", "anv123", undefined, new Date(), { fresh: true })
    );

    expect(ticket?.fresh).toBe(true);
  });

  it("saknas på en vanlig lapp", () => {
    const ticket = decodeTicket("admin", encodeTicket("admin", "anv123"));

    expect(ticket?.fresh).toBeUndefined();
  });

  /**
   * DET HÄR ÄR TESTET SOM BETYDER NÅGOT.
   *
   * Går märket att lägga till i efterhand räcker det att känna till ett
   * konto-id för att komma in i panelen utan både kod och lösenord. Lappen
   * är signerad med AUTH_SECRET, så en ändrad kropp ska inte godkännas alls.
   */
  it("går inte att lägga till i efterhand", () => {
    const honest = encodeTicket("admin", "anv123");
    const [body] = honest.split(".");

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as Record<string, unknown>;

    payload.fresh = true;

    const forged = `${Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    )}.${honest.split(".")[1]}`;

    expect(decodeTicket("admin", forged)).toBeNull();
  });

  it("en lapp för plattformen går inte att använda som kundens", () => {
    const platform = encodeTicket("platform", "vi@tikkr.se", undefined, new Date(), {
      fresh: true,
    });

    expect(decodeTicket("admin", platform)).toBeNull();
  });

  it("en gammal lapp godtas inte, hur märkt den än är", () => {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const ticket = encodeTicket("admin", "anv123", undefined, old, {
      fresh: true,
    });

    expect(decodeTicket("admin", ticket)).toBeNull();
  });
});

/**
 * VEM SOM FÅR UTFÄRDA EN LAPP MED MÄRKET.
 *
 * Märket är en väg in i panelen utan kod från autentiseringsappen. Det är
 * avsiktligt, och det är avsiktligt att det finns PÅ ETT STÄLLE: en andra
 * anropsplats vore en andra väg förbi tvåsteget, och den sortens rad ser
 * harmlös ut i en kodgranskning.
 *
 * Kontrollen härleds ur källkoden i stället för att lita på att någon minns
 * regeln, av samma skäl som module-coverage härleder vilka filer som rör en
 * modul.
 */
describe("märket sätts bara av registreringen", () => {
  const SRC = path.resolve(__dirname, "..", "src");

  /**
   * De två filer som får nämna märket i kod, och ingen annan.
   *
   * Den ena DEFINIERAR det och den andra ANVÄNDER det. Att definitionen står
   * med är inte en lucka: ändras den filen ändras märkets innebörd, och det
   * är ett beslut, inte en rad man råkar skriva.
   */
  const DEFINITION = path.join("lib", "login-ticket.ts");
  const CALLER = path.join("app", "registrera", "actions.ts");

  function filesIn(dir: string): string[] {
    const found: string[] = [];

    for (const entry of readdirSync(dir)) {
      const next = path.join(dir, entry);

      if (statSync(next).isDirectory()) found.push(...filesIn(next));
      else if (/\.(ts|tsx)$/.test(next)) found.push(next);
    }

    return found;
  }

  it("ingen annan fil ber om en lapp med fresh", () => {
    const callers = filesIn(SRC).filter((file) => {
      const source = readFileSync(file, "utf8")
        // Kommentarerna nämner märket på flera ställen, och ska få göra det.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      return /fresh:\s*true/.test(source);
    });

    expect(callers.map((file) => path.relative(SRC, file)).sort()).toEqual(
      [CALLER, DEFINITION].sort()
    );
  });

  it("registreringen gör det fortfarande", () => {
    const source = readFileSync(path.join(SRC, CALLER), "utf8");

    expect(source).toMatch(/fresh:\s*true/);
  });
});
