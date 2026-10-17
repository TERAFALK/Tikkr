import { describe, it, expect } from "vitest";
import { laneTotals } from "@/lib/plan-live";

/**
 * VECKANS SUMMA PER ANSTÄLLD (fas 4 av issue #21). Behöver ingen databas.
 *
 * Planerat och stämplat INOM passen, så att två tal av samma sort jämförs:
 * det som var tänkt och det som blev av det.
 */

describe("planerat och stämplat per rad", () => {
  it("summerar passen och det som stämplats inom dem", () => {
    const totals = laneTotals(
      [
        { id: "a", laneId: "anna", minutes: 240 },
        { id: "b", laneId: "anna", minutes: 120 },
        { id: "c", laneId: "bertil", minutes: 60 },
      ],
      { a: { clockedMinutes: 200 }, c: { clockedMinutes: 75 } }
    );

    expect(totals.get("anna")).toEqual({ plannedMinutes: 360, clockedMinutes: 200 });
    expect(totals.get("bertil")).toEqual({ plannedMinutes: 60, clockedMinutes: 75 });
  });

  it("ett pass utan stämpling räknas som noll stämplat", () => {
    const totals = laneTotals([{ id: "a", laneId: "anna", minutes: 60 }], {});
    expect(totals.get("anna")).toEqual({ plannedMinutes: 60, clockedMinutes: 0 });
  });

  it("en rad utan pass har ingen summa", () => {
    expect(laneTotals([], {}).has("anna")).toBe(false);
  });
});
