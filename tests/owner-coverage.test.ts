import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * SKYDDSNÄT FÖR ÄGARENS ÅTGÄRDER (beslutat 2026-10-18).
 *
 * Bara arbetsytans ägare ändrar fakturan och anonymiserar, se isOwner i
 * admin-session.ts. Gränssnittet döljer knapparna för en administratör, men
 * en serveråtgärd är en publik ingång och nås ändå. Därför prövas här att
 * varje sådan åtgärd kallar isOwner(session) själv.
 *
 * Prenumerationens åtgärder härleds ur filen och inte ur en lista: allt som
 * exporteras där ändrar vad kunden betalar, och en ny åtgärd ska inte kunna
 * läggas till utan vakten.
 *
 * Behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

/** Kroppen för varje exporterad async-funktion i en fil, med namn. */
function exportedBodies(source: string): { name: string; body: string }[] {
  const starts = [...source.matchAll(/^export async function (\w+)/gm)];

  return starts.map((match, index) => ({
    name: match[1],
    body: source.slice(match.index, starts[index + 1]?.index ?? source.length),
  }));
}

const BILLING = "src/app/admin/(panel)/installningar/prenumeration/actions.ts";

/** Åtgärder utanför prenumerationen som också är ägarens. */
const OWNER_ACTIONS = [
  { file: "src/app/admin/(panel)/installningar/actions.ts", name: "anonymizeEmployee" },
  // En beställning av tillbehör ändrar vad kunden betalar (2026-10-20).
  { file: "src/app/admin/(panel)/butik/actions.ts", name: "placeShopOrder" },
];

describe("bara ägaren ändrar fakturan och anonymiserar", () => {
  it("hittar prenumerationens åtgärder", () => {
    // Flyttas filen ska testet säga det, inte tystna.
    expect(exportedBodies(read(BILLING)).length).toBeGreaterThanOrEqual(4);
  });

  it("varje åtgärd i prenumerationen prövar ägaren", () => {
    const missing = exportedBodies(read(BILLING))
      .filter(({ body }) => !/isOwner\(session\)/.test(body))
      .map(({ name }) => name);

    expect(missing).toEqual([]);
  });

  it("anonymiseringen och beställningen prövar ägaren", () => {
    const missing = OWNER_ACTIONS.filter(({ file, name }) => {
      const action = exportedBodies(read(file)).find((entry) => entry.name === name);
      return !action || !/isOwner\(session\)/.test(action.body);
    }).map(({ name }) => name);

    expect(missing).toEqual([]);
  });
});
