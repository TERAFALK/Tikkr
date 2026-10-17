import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_PLANNING_MODE,
  PLANNING_MODES,
  PLANNING_MODE_KEYS,
  PLANNING_VIEWS,
  isPlanningMode,
  pickView,
  viewsFor,
} from "@/lib/planning-modes";

/**
 * PLANERINGSLÄGENA (issue #21).
 *
 * Läget avgör vilka vyer tavlan har och vilken resurs som räknar av orderns
 * beräknade tid. Tre saker får inte glida:
 *
 *  1. REGISTRET OCH SCHEMAT säger samma sak, som modules.ts och
 *     CompanyModuleKey. Ett läge i registret som inte finns i enumen går inte
 *     att spara, och ett värde i enumen som inte finns i registret ger en
 *     tavla utan vyer.
 *  2. BEFINTLIGA KUNDER ÄR KVAR I PRODUKTION. Förvalet i koden, i schemat och
 *     i migrationen är samma, och det läget har stationsvyn först.
 *  3. EXAKT EN RESURS RÄKNAR AV BERÄKNINGEN, och den är en av lägets vyer.
 *     Annars planeras samma timme två gånger, eller ingen gång.
 *
 * Läser källtext och registret, behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

function enumValues(name: string): string[] {
  const start = SCHEMA.indexOf(`enum ${name} {`);
  expect(start, `${name} saknas i schemat`).toBeGreaterThan(-1);

  const body = SCHEMA.slice(start, SCHEMA.indexOf("\n}", start));

  return body
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => /^[A-Z_]+$/.test(line));
}

describe("registret och schemat säger samma sak", () => {
  it("varje läge i registret finns i enumen, och tvärtom", () => {
    expect([...PLANNING_MODE_KEYS].sort()).toEqual(
      enumValues("PlanningMode").sort()
    );
  });

  it("registret drar inte in något annat", () => {
    const source = readFileSync(
      path.join(ROOT, "src/lib/planning-modes.ts"),
      "utf8"
    );

    expect(
      [...source.matchAll(/^import\s/gm)].length,
      "src/lib/planning-modes.ts har fått en import. Filen måste förbli " +
        "beroendefri, som modules.ts."
    ).toBe(0);
  });
});

describe("befintliga kunder behåller stationerna", () => {
  it("förvalet är Produktion, med stationerna som första vy", () => {
    expect(DEFAULT_PLANNING_MODE).toBe("PRODUCTION");
    expect(viewsFor(DEFAULT_PLANNING_MODE)[0]).toBe("stations");
    expect(PLANNING_MODES[DEFAULT_PLANNING_MODE].countsBudget).toBe("stations");
  });

  it("schemat har samma förval", () => {
    expect(SCHEMA).toMatch(
      /planningMode\s+PlanningMode\s+@default\(PRODUCTION\)/
    );
  });

  it("migrationen ger varje befintligt företag förvalet", () => {
    // Kolumnen läggs till med NOT NULL och förval i samma sats. Utan förvalet
    // hade migrationen fallit på varje företag som redan finns, och med ett
    // annat förval hade de bytt läge utan att någon valt det.
    const dir = path.join(ROOT, "prisma/migrations");

    const sql = readdirSync(dir)
      .filter((name) => !name.endsWith(".toml"))
      .map((name) => {
        try {
          return readFileSync(path.join(dir, name, "migration.sql"), "utf8");
        } catch {
          return "";
        }
      })
      .find((text) => text.includes('"planning_mode"'));

    expect(sql, "Ingen migration lägger till planning_mode").toBeDefined();
    expect(sql).toMatch(
      /ADD COLUMN\s+"planning_mode"\s+"PlanningMode"\s+NOT NULL\s+DEFAULT\s+'PRODUCTION'/
    );
  });
});

describe("varje läge går att planera i", () => {
  for (const key of PLANNING_MODE_KEYS) {
    const mode = PLANNING_MODES[key];

    it(`${key} har minst en vy, och inga dubbletter`, () => {
      expect(mode.views.length).toBeGreaterThan(0);
      expect(new Set(mode.views).size).toBe(mode.views.length);
    });

    it(`${key} räknar av beräkningen med en av sina egna vyer`, () => {
      // En resurs som inte har en vy kan inte planeras, och då kommer den
      // beräknade tiden aldrig ur Oplacerat.
      expect(mode.views).toContain(mode.countsBudget);
    });
  }

  it("Tjänst har inga stationer", () => {
    expect(viewsFor("SERVICE")).toEqual(["staff"]);
    expect(PLANNING_MODES.SERVICE.countsBudget).toBe("staff");
  });

  it("Produktion har bara stationer på tavlan", () => {
    // Fliken Personal togs bort ur Produktion 2026-10-17, produktägarens
    // beslut. Ett pass gick inte att planera där, bara se.
    expect(viewsFor("PRODUCTION")).toEqual(["stations"]);
    expect(PLANNING_MODES.PRODUCTION.countsBudget).toBe("stations");
  });

  it("bemanning finns i Produktion, inte i Tjänst", () => {
    // Bemanna i stationsrutan är kvar i Produktion. Tjänst har inga
    // stationsrutor att bemanna.
    expect(PLANNING_MODES.PRODUCTION.staffsStations).toBe(true);
    expect(PLANNING_MODES.SERVICE.staffsStations).toBe(false);
  });

  it("vyernas adresser är unika", () => {
    const slugs = Object.values(PLANNING_VIEWS).map((view) => view.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("vyn ur adressfältet", () => {
  it("utan värde ges lägets första vy", () => {
    expect(pickView("PRODUCTION", undefined)).toBe("stations");
    expect(pickView("PRODUCTION", null)).toBe("stations");
    expect(pickView("SERVICE", undefined)).toBe("staff");
  });

  it("en vy läget har väljs", () => {
    expect(pickView("SERVICE", "personal")).toBe("staff");
    expect(pickView("PRODUCTION", "stationer")).toBe("stations");
  });

  it("en vy läget inte har ger lägets första i stället för ett fel", () => {
    // Ett bokmärke till Stationer hos ett företag som bytt till Tjänst.
    expect(pickView("SERVICE", "stationer")).toBe("staff");
    expect(pickView("PRODUCTION", "nagot-annat")).toBe("stations");

    // Ett bokmärke till Personal från tiden då Produktion hade fliken.
    expect(pickView("PRODUCTION", "personal")).toBe("stations");
  });

  it("nyckeln i koden duger inte som adress", () => {
    // Adressen är svensk. "staff" i adressfältet är inte en vy.
    expect(pickView("PRODUCTION", "staff")).toBe("stations");
  });
});

describe("data utifrån", () => {
  it("bara kända lägen godtas", () => {
    expect(isPlanningMode("PRODUCTION")).toBe(true);
    expect(isPlanningMode("SERVICE")).toBe(true);
    expect(isPlanningMode("production")).toBe(false);
    expect(isPlanningMode("")).toBe(false);
    expect(isPlanningMode(null)).toBe(false);
    expect(isPlanningMode("toString")).toBe(false);
  });
});
