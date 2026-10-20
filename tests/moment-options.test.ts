import { describe, expect, it } from "vitest";
import { momentOptionsFor } from "@/lib/moment-options";

/**
 * Rutan som ändrar en stämpling, se moment-options.ts. Delas sedan 2026-10-20
 * av alla rader i Stämplingar, så regeln räknas för varje öppning och inte en
 * gång per rad på servern.
 */

const moments = [
  { id: "svets", name: "Svetsning", active: true },
  { id: "fras", name: "Fräsning", active: false },
  { id: "lack", name: "Lackering", active: true },
];

describe("momentOptionsFor", () => {
  it("visar bara aktiva moment för en post på ett aktivt moment", () => {
    expect(momentOptionsFor(moments, "svets").map((option) => option.id)).toEqual([
      "svets",
      "lack",
    ]);
  });

  it("behåller postens eget avaktiverade moment, märkt", () => {
    expect(momentOptionsFor(moments, "fras")).toEqual([
      { id: "svets", label: "Svetsning" },
      { id: "fras", label: "Fräsning (avaktiverat)" },
      { id: "lack", label: "Lackering" },
    ]);
  });

  it("utan moment finns bara de aktiva", () => {
    expect(momentOptionsFor(moments, null)).toHaveLength(2);
  });
});
