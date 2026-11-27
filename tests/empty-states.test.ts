import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * EN TOM LISTA VISAR VÄGEN VIDARE (beslutat 2026-11-27).
 *
 * Kunder visade "Inga kunder upplagda" utan knapp, medan Anställda hade Ny
 * anställd mitt i den tomma listan. Regeln står i TONE-OF-VOICE.md under Tomma
 * tillstånd:
 *
 * - Kan man lägga upp något på sidan står samma knapp i den tomma listan som i
 *   sidhuvudet.
 * - Beror sidan på ett annat register står en knapp som leder dit.
 * - En lista man bara läser, eller ett filter utan träff, har ingen knapp.
 *
 * Testet läser varje <EmptyState> i panelen och plattformen, och fäller ett
 * tomt läge utan `action` som inte står i listan över undantag med sitt skäl.
 * Ett nytt tomt läge måste alltså antingen få en knapp eller ett skäl här.
 */

const ROOTS = ["src/app/admin", "src/app/plattform"];

/** Tomma lägen utan knapp, med skälet. Nyckeln är rubriken. */
const WITHOUT_ACTION: Record<string, string> = {
  "Inget att granska": "Granskningen fylls av systemet, inte av en knapp",
  "Inga ändringar": "Ändringsloggen skrivs av systemet",
  "Inga nyheter": "Nyheterna följer med versionen",
  "Inga produkter": "Butikens produkter läggs upp av oss i plattformen",
  "Inga stämplingar matchar": "Ett filter utan träff, filtret står ovanför",
  "Välj en anställd": "Väljaren står ovanför",
  "Inget att hantera": "Plattformens beställningar läggs av kunderna",
  "Inga beställningar": "Plattformens beställningar läggs av kunderna",
  "Inga registrerade åtgärder": "Händelseloggen skrivs av systemet",
  "Arkivet är tomt": "Inkorgens arkiv fylls av klarmarkeringar",
  "Inga nya meddelanden": "Inkorgen fylls av kunderna",
  "Inga registrerade kunder": "Kunderna registrerar sig själva",
  "Inga arkiverade meddelanden": "Arkivet fylls när meddelanden går ut",
  "Inga meddelanden inlagda": "Formuläret Nytt meddelande står ovanför",
  "Ingenting har ändrats": "Kundens historik skrivs av systemet",
  "Inga integrationer anslutna": "Systemen att ansluta står under Tillgängliga",
  "Inkorgen är tom": "Integrationens inkorg fylls av synken",
  "Inga kopplade kunder": "Kopplingarna görs av synken och i inkorgen",
  "Inga ignorerade kunder": "Fylls när en post ignoreras i inkorgen",
  "Inga kopplade ordrar": "Kopplingarna görs av synken och i inkorgen",
  "Inga ignorerade ordrar": "Fylls när en post ignoreras i inkorgen",
  "Ingenting har hänt än": "Integrationens logg skrivs av systemet",
  "Ingen gateway ansluten": "Registreringen står i kortet ovanför",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** Varje <EmptyState …/> i källan, från taggen till dess egen avslutning. */
function emptyStates(source: string): string[] {
  const found: string[] = [];
  let from = 0;

  while ((from = source.indexOf("<EmptyState", from)) !== -1) {
    let depth = 0;
    let end = from;

    for (let i = from; i < source.length; i++) {
      const char = source[i];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (depth === 0 && char === "/" && source[i + 1] === ">") {
        end = i + 2;
        break;
      }
    }

    found.push(source.slice(from, end));
    from = end;
  }

  return found;
}

/**
 * Rubrikerna ett tomt läge kan visa, även båda grenarna av ett villkor.
 * En sträng som jämförs med, som `view === "arkiv"`, är inte en rubrik.
 */
function titles(element: string): string[] {
  const attribute = element.match(/title=(\{[^}]*\}|"[^"]*")/)?.[1] ?? "";
  return [...attribute.matchAll(/(===?\s*|!==?\s*)?(?:"([^"]+)"|`([^`$]+))/g)]
    .filter((match) => !match[1])
    .map((match) => (match[2] ?? match[3]).trim());
}

const cases = ROOTS.flatMap(files).flatMap((path) =>
  emptyStates(readFileSync(path, "utf8")).map((element) => ({
    file: relative(process.cwd(), path).replaceAll("\\", "/"),
    element,
  }))
);

describe("tomma listor", () => {
  it("hittar de tomma lägena i panelerna", () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  it.each(cases)("$file: en knapp eller ett skäl", ({ element }) => {
    if (element.includes("action=")) return;

    const names = titles(element);
    expect(names.length, element).toBeGreaterThan(0);

    for (const name of names) {
      expect(
        WITHOUT_ACTION[name],
        `"${name}" saknar knapp. Lägg samma knapp som i sidhuvudet, eller ett skäl i WITHOUT_ACTION.`
      ).toBeDefined();
    }
  });

  it("Kunder har samma knapp i den tomma listan som i sidhuvudet", () => {
    const source = readFileSync("src/app/admin/(panel)/kunder/page.tsx", "utf8");
    expect(source).toMatch(/<PageHeader[^>]*action=\{newCustomer\}/);
    expect(source).toMatch(/title="Inga kunder upplagda"\s+action=\{newCustomer\}/);
  });
});
