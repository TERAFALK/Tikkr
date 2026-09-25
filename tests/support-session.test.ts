import { describe, it, expect, beforeEach } from "vitest";
import { __internals } from "@/lib/support-session";

/**
 * SUPPORTSESSIONENS SIGNATUR.
 *
 * Cookien ger läsåtkomst till EN kunds panel utan kundens lösenord. Går den att
 * ändra i efterhand kan vem som helst skriva sitt eget companyId och läsa vilken
 * kund de vill. Signaturen är alltså hela spärren, och den ska gå att kontrollera
 * utan att starta en webbserver.
 *
 * Behöver ingen databas.
 */

const { encode, decode, sign, LIFETIME_SECONDS } = __internals;

/**
 * Bygger en KORREKT SIGNERAD cookie ur valfritt innehåll.
 *
 * Behövs för att pröva kontrollen av fälten. Skulle testet signera fel skulle
 * det falla på signaturen i stället, och då bevisar det ingenting om det det
 * påstår sig pröva.
 */
function signed(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

const valid = () => ({
  companyId: "company-1",
  email: "adi@terafalk.se",
  visitId: "visit-1",
  exp: Math.floor(Date.now() / 1000) + 600,
});

beforeEach(() => {
  process.env.AUTH_SECRET = "testhemlighet-for-supportsessionen";
});

describe("tur och retur", () => {
  it("läser tillbaka vad som skrevs", () => {
    const payload = valid();

    expect(decode(encode(payload))).toEqual(payload);
  });

  it("livslängden är en halvtimme", () => {
    // Kortare än plattformens åtta timmar med flit: en glömd flik ska inte
    // ligga öppen mot en kunds personuppgifter över natten.
    expect(LIFETIME_SECONDS).toBe(30 * 60);
  });
});

describe("manipulerade cookies avvisas", () => {
  it("ändrat innehåll utan ny signatur", () => {
    const token = encode(valid());
    const [, signature] = token.split(".");

    // Samma signatur, men ett annat företag. Det här är hela hotet.
    const forged = Buffer.from(
      JSON.stringify({ ...valid(), companyId: "nagon-annan-kund" })
    ).toString("base64url");

    expect(decode(`${forged}.${signature}`)).toBeNull();
  });

  it("påhittad signatur", () => {
    const [body] = encode(valid()).split(".");

    expect(decode(`${body}.pahittat`)).toBeNull();
  });

  it("signatur från en annan hemlighet", () => {
    const token = encode(valid());

    process.env.AUTH_SECRET = "en-helt-annan-hemlighet";

    expect(decode(token)).toBeNull();
  });

  it("skräp utan punkt", () => {
    expect(decode("bara-en-strang")).toBeNull();
  });

  it("tom sträng", () => {
    expect(decode("")).toBeNull();
  });

  it("korrekt signerat innehåll som inte är JSON", () => {
    // Signaturen stämmer. Det är JSON-läsningen som måste fånga det här.
    const body = Buffer.from("inte json").toString("base64url");

    expect(decode(`${body}.${sign(body)}`)).toBeNull();
  });
});

describe("utgången session gäller inte", () => {
  it("exp i förfluten tid avvisas", () => {
    // Även med en signatur som stämmer. En utgången cookie är inte manipulerad,
    // den är bara gammal, och den ska ändå inte ge åtkomst.
    const token = encode({
      ...valid(),
      exp: Math.floor(Date.now() / 1000) - 1,
    });

    expect(decode(token)).toBeNull();
  });

  it("en cookie som gäller en sekund till fungerar", () => {
    // Gränsen ska ligga vid utgångstiden och inte en marginal före den.
    const token = encode({
      ...valid(),
      exp: Math.floor(Date.now() / 1000) + 1,
    });

    expect(decode(token)).not.toBeNull();
  });
});

describe("ofullständigt innehåll avvisas", () => {
  // Ett fält som saknas får aldrig bli undefined längre in i koden. Ett
  // companyId som är undefined skulle nå forCompany(), som kastar — men
  // felet ska komma här, där det går att förstå.
  const cases: { name: string; payload: Record<string, unknown> }[] = [
    { name: "utan companyId", payload: { ...valid(), companyId: "" } },
    { name: "utan email", payload: { ...valid(), email: "" } },
    { name: "utan visitId", payload: { ...valid(), visitId: "" } },
    { name: "utan exp", payload: { ...valid(), exp: undefined } },
    { name: "exp som text", payload: { ...valid(), exp: "snart" } },
  ];

  for (const { name, payload } of cases) {
    it(name, () => {
      // KORREKT signerat. Faller det här beror det på fältkontrollen, som är
      // det testet finns för.
      expect(decode(signed(payload))).toBeNull();
    });
  }
});
