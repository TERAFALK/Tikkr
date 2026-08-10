import { describe, it, expect } from "vitest";
import { nextOccurrenceOf, parseTimeOfDay, wallTimeIn } from "@/lib/time-zone";

/**
 * Tidszonsräkningen. Behöver ingen databas.
 *
 * Det viktiga: "18:00" ska betyda 18:00 på verkstadsgolvet — både i juli och i
 * januari. Sverige ligger två timmar före UTC på sommaren och en på vintern.
 */

const SE = "Europe/Stockholm";

describe("klockslag på väggen", () => {
  it("sommartid: 18:00 i Stockholm är 16:00 UTC", () => {
    const wall = wallTimeIn(new Date("2026-07-03T16:00:00Z"), SE);
    expect(wall.hour).toBe(18);
    expect(wall.day).toBe(3);
  });

  it("vintertid: 18:00 i Stockholm är 17:00 UTC", () => {
    const wall = wallTimeIn(new Date("2026-01-03T17:00:00Z"), SE);
    expect(wall.hour).toBe(18);
  });
});

describe("nästa gång klockan slår 18:00", () => {
  it("samma dag om klockslaget inte passerat (sommar)", () => {
    // 12:00 svensk tid en julidag
    const after = new Date("2026-07-03T10:00:00Z");
    expect(nextOccurrenceOf("18:00", after, SE).toISOString()).toBe(
      "2026-07-03T16:00:00.000Z"
    );
  });

  it("samma dag om klockslaget inte passerat (vinter)", () => {
    const after = new Date("2026-01-03T10:00:00Z");
    expect(nextOccurrenceOf("18:00", after, SE).toISOString()).toBe(
      "2026-01-03T17:00:00.000Z"
    );
  });

  it("nästa dag om klockslaget redan passerat — kvällsskift stängs inte direkt", () => {
    // 20:00 svensk tid, alltså efter dagens 18:00
    const after = new Date("2026-07-03T18:00:00Z");
    expect(nextOccurrenceOf("18:00", after, SE).toISOString()).toBe(
      "2026-07-04T16:00:00.000Z"
    );
  });

  it("hanterar månadsskifte", () => {
    const after = new Date("2026-07-31T18:00:00Z");
    expect(nextOccurrenceOf("18:00", after, SE).toISOString()).toBe(
      "2026-08-01T16:00:00.000Z"
    );
  });

  it("hanterar årsskifte", () => {
    const after = new Date("2026-12-31T18:00:00Z");
    expect(nextOccurrenceOf("18:00", after, SE).toISOString()).toBe(
      "2027-01-01T17:00:00.000Z"
    );
  });

  it("klockslaget glider inte över tidsomställningen", () => {
    // Sista söndagen i mars 2027 ställs klockan fram. Dagen efter ska 18:00
    // fortfarande vara 18:00 lokalt — inte 17:00 eller 19:00.
    const after = new Date("2027-03-29T06:00:00Z");
    const result = nextOccurrenceOf("18:00", after, SE);

    expect(wallTimeIn(result, SE).hour).toBe(18);
    expect(wallTimeIn(result, SE).minute).toBe(0);
  });

  it("fungerar med andra klockslag och tidszoner", () => {
    const after = new Date("2026-07-03T10:00:00Z");
    expect(nextOccurrenceOf("02:00", after, SE).toISOString()).toBe(
      "2026-07-04T00:00:00.000Z"
    );
  });
});

describe("tolkning av klockslag", () => {
  it("läser HH:MM", () => {
    expect(parseTimeOfDay("18:00")).toEqual({ hour: 18, minute: 0 });
    expect(parseTimeOfDay("02:30")).toEqual({ hour: 2, minute: 30 });
  });

  it("vägrar orimliga värden", () => {
    expect(() => parseTimeOfDay("25:00")).toThrow();
    expect(() => parseTimeOfDay("18:70")).toThrow();
    expect(() => parseTimeOfDay("sex")).toThrow();
    expect(() => parseTimeOfDay("")).toThrow();
  });
});
