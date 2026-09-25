import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * SKYDDSNÄT FÖR LÄSLÄGET.
 *
 * Supportbesök får läsa allt och ändra ingenting. `session.db` vägrar skriva,
 * men det räcker inte som enda spärr — och det är värt att förklara varför,
 * eftersom det var nära att bli det.
 *
 * `clock.ts`, `admin-users.ts` och `quick-order.ts` tar ett companyId och bygger
 * SIN EGEN klient med `forCompany()`. En åtgärd som går genom dem skriver
 * alltså, hur låst sessionens klient än är. Samma sak gäller `Company`, som
 * inte kan filtreras på sig själv och därför nås via `unsafeGlobalPrisma`.
 *
 * Därför gäller en enkel och hård regel i stället:
 *
 *   VARJE serveråtgärd i adminpanelen som kallar requireAdmin() ska kalla
 *   assertWritable(session) direkt efteråt.
 *
 * Alla åtgärder i panelen ändrar data — det finns ingen som bara läser. Regeln
 * kostar alltså ingenting, och den är lätt att kontrollera: lika många vakter
 * som anrop. Glömmer någon en i en ny fil går det här testet sönder.
 *
 * Behöver ingen databas.
 */

const PANEL_ROOT = path.resolve(__dirname, "../src/app/admin/(panel)");

/**
 * Åtgärder som BARA läser och därför inte behöver vakten.
 *
 * Tom med flit. En rad här är ett hål i skyddet och måste ha ett skäl som
 * håller — skriv varför, och kontrollera att åtgärden verkligen inte rör
 * databasen, varken direkt eller genom en hjälpfunktion.
 */
const READ_ONLY_ACTIONS: string[] = [];

function actionFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...actionFiles(full));
    else if (entry.name === "actions.ts") found.push(full);
  }

  return found;
}

const files = actionFiles(PANEL_ROOT).map((file) => ({
  file: path
    .relative(path.resolve(__dirname, ".."), file)
    .split(path.sep)
    .join("/"),
  source: readFileSync(file, "utf8"),
}));

const count = (source: string, pattern: RegExp) =>
  (source.match(pattern) ?? []).length;

describe("supportläget kan inte skriva", () => {
  it("hittar åtgärdsfiler att granska alls", () => {
    // Flyttas katalogerna ska testet säga det, inte tystna och se grönt ut
    // för att listan blev tom.
    expect(files.length).toBeGreaterThan(5);
  });

  it("varje requireAdmin i panelen följs av en assertWritable", () => {
    const wrong = files
      .map(({ file, source }) => ({
        file,
        calls: count(source, /await requireAdmin\(\)/g),
        guards: count(source, /assertWritable\(session\)/g),
      }))
      .filter(({ calls, guards }) => calls !== guards);

    expect(
      wrong,
      `Dessa filer har olika många requireAdmin() och assertWritable(session). ` +
        `En åtgärd utan vakt kan skriva i supportläge — läsläget på session.db ` +
        `räcker inte, eftersom clock.ts och admin-users.ts bygger egna klienter ` +
        `ur companyId. Lägg assertWritable(session) direkt efter requireAdmin().`
    ).toEqual([]);
  });

  it("varje åtgärd som kallar requireAdmin har en vakt i samma funktion", () => {
    // Lika många anrop som vakter kan i teorin stämma medan de sitter i fel
    // funktioner. Här kontrolleras varje funktion för sig.
    const unguarded: string[] = [];

    for (const { file, source } of files) {
      const blocks = source.split(/^export async function /m).slice(1);

      for (const block of blocks) {
        const name = block.slice(0, block.indexOf("(")).trim();
        if (READ_ONLY_ACTIONS.includes(name)) continue;
        if (!/await requireAdmin\(\)/.test(block)) continue;
        if (/assertWritable\(session\)/.test(block)) continue;

        unguarded.push(`${file}: ${name}`);
      }
    }

    expect(
      unguarded,
      "Dessa åtgärder kallar requireAdmin() utan assertWritable(session) i " +
        "samma funktion. De skulle kunna ändra kundens data under ett " +
        "supportbesök."
    ).toEqual([]);
  });

  it("vakten importeras där den används", () => {
    const missing = files
      .filter(({ source }) => source.includes("assertWritable(session)"))
      .filter(({ source }) => !/import \{[^}]*assertWritable/.test(source))
      .map(({ file }) => file);

    expect(missing, "assertWritable används men importeras inte.").toEqual([]);
  });

  it("listan över läsande undantag är tom eller motiverad", () => {
    // Inte ett funktionskrav, utan en påminnelse. Växer listan har någon lagt
    // till ett hål, och då ska det ha krävt att de läste kommentaren ovanför.
    expect(READ_ONLY_ACTIONS.length).toBeLessThanOrEqual(3);
  });
});
