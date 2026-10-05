import { describe, it, expect } from "vitest";
import { clientIpFrom } from "@/lib/client-ip";

/**
 * Avsändarens IP bakom proxyn.
 *
 * Första värdet i X-Forwarded-For skrivs av klienten själv. Spärren mot
 * gissning av kopplingskoder räknade på det, och gick därför att kringgå genom
 * att byta header vid varje försök. Det testerna skyddar: bara det proxyn
 * lade till räknas.
 */

function source(values: Record<string, string>) {
  return {
    get: (name: string) => values[name.toLowerCase()] ?? null,
  };
}

describe("klientens egna uppgifter räknas inte", () => {
  it("ett påhittat första värde ignoreras", () => {
    // Nginx Proxy Manager lägger till den riktiga adressen sist.
    expect(
      clientIpFrom(source({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))
    ).toBe("203.0.113.7");
  });

  it("ett nytt påhittat värde per anrop ger samma nyckel", () => {
    const a = clientIpFrom(source({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" }));
    const b = clientIpFrom(source({ "x-forwarded-for": "10.0.0.2, 203.0.113.7" }));
    expect(a).toBe(b);
  });
});

describe("det proxyn satte används", () => {
  it("ett enda värde, som Caddy skriver", () => {
    expect(clientIpFrom(source({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7"
    );
  });

  it("X-Real-IP när X-Forwarded-For saknas", () => {
    expect(clientIpFrom(source({ "x-real-ip": " 203.0.113.7 " }))).toBe(
      "203.0.113.7"
    );
  });

  it("ingenting när båda saknas", () => {
    expect(clientIpFrom(source({}))).toBeUndefined();
  });

  it("tomma fält mellan kommatecknen hoppas över", () => {
    expect(clientIpFrom(source({ "x-forwarded-for": "1.2.3.4, 203.0.113.7, " }))).toBe(
      "203.0.113.7"
    );
  });
});
