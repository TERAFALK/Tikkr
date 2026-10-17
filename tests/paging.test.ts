import { describe, it, expect } from "vitest";
import { pageGroups, pageRows, paging } from "@/lib/paging";
import { weekStep } from "@/lib/week-nav";

/**
 * Sidbläddringen i Stämplingar och Rapporter (issue #24).
 *
 * Listorna visar en sida i taget, men summorna ovanför dem ska alltid gälla
 * hela urvalet. Testerna fäller en sida som tappar rader mellan två sidor, en
 * grupp vars summa krymper till sidans, och ett sidnummer som följer med när
 * perioden byts.
 */

describe("paging", () => {
  it("börjar på sidan ett och räknar antalet sidor", () => {
    expect(paging(120, undefined, 50)).toEqual({
      page: 1,
      pageCount: 3,
      skip: 0,
      take: 50,
    });
  });

  it("läser sidnumret ur adressen", () => {
    expect(paging(120, "3", 50)).toMatchObject({ page: 3, skip: 100 });
  });

  it("stannar på sista sidan när numret är för högt", () => {
    // Ett bokmärke till sida 9 i ett urval som krympt ska visa något, inte
    // en tom lista utan förklaring.
    expect(paging(120, "9", 50)).toMatchObject({ page: 3, skip: 100 });
  });

  it("tål skräp i adressen", () => {
    for (const junk of ["0", "-2", "abc", "", "1.5e9"]) {
      const result = paging(120, junk, 50);
      expect(result.page).toBeGreaterThanOrEqual(1);
      expect(result.page).toBeLessThanOrEqual(3);
      expect(Number.isInteger(result.skip)).toBe(true);
    }
  });

  it("har en sida även när urvalet är tomt", () => {
    expect(paging(0, "4", 50)).toEqual({
      page: 1,
      pageCount: 1,
      skip: 0,
      take: 50,
    });
  });
});

describe("pageRows", () => {
  it("delar listan utan att tappa eller dubblera en rad", () => {
    const rows = Array.from({ length: 123 }, (_, index) => index);
    const seen: number[] = [];

    for (let page = 1; page <= 3; page++) {
      seen.push(...pageRows(rows, paging(rows.length, String(page), 50)));
    }

    expect(seen).toEqual(rows);
  });
});

describe("pageGroups", () => {
  const groups = [
    { heading: "Anna", minutes: 600, total: 3, rows: ["a1", "a2", "a3"] },
    { heading: "Bosse", minutes: 120, total: 2, rows: ["b1", "b2"] },
    { heading: "Cecilia", minutes: 60, total: 1, rows: ["c1"] },
  ];

  it("behåller gruppernas egna summor när en grupp delas mellan två sidor", () => {
    const first = pageGroups(groups, paging(6, "1", 4));

    expect(first.map((group) => group.heading)).toEqual(["Anna", "Bosse"]);
    expect(first[1].rows).toEqual(["b1"]);
    // Summan är hela gruppens, inte den enda raden som ryms på sidan.
    expect(first[1].minutes).toBe(120);
    expect(first[1].total).toBe(2);
  });

  it("utelämnar grupper som inte har någon rad på sidan", () => {
    const second = pageGroups(groups, paging(6, "2", 4));

    expect(second.map((group) => group.heading)).toEqual(["Bosse", "Cecilia"]);
    expect(second[0].rows).toEqual(["b2"]);
  });

  it("visar varje rad exakt en gång över alla sidor", () => {
    const seen = [1, 2, 3, 4, 5, 6].flatMap((page) =>
      pageGroups(groups, paging(6, String(page), 1)).flatMap(
        (group) => group.rows
      )
    );

    expect(seen).toEqual(["a1", "a2", "a3", "b1", "b2", "c1"]);
  });
});

describe("weekStep och sidnumret", () => {
  it("börjar om på sidan ett när perioden flyttas", () => {
    // Sida 4 av förra veckan säger ingenting om nästa vecka. Följde numret
    // med hamnade man mitt i en lista, eller på dess sista sida, utan att
    // veta varför.
    const { backHref, forwardHref } = weekStep(
      "/admin/stamplingar",
      { from: "2026-10-05", to: "2026-10-11", employeeId: "e1", sida: "4" },
      "Europe/Stockholm"
    );

    for (const href of [backHref, forwardHref]) {
      const search = new URL(href, "https://tikkr.test").searchParams;
      expect(search.get("sida")).toBeNull();
      expect(search.get("employeeId")).toBe("e1");
    }
  });
});
