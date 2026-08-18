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

/**
 * Nätterna då klockan ställs om.
 *
 * Sista söndagen i mars finns klockan 02:30 inte alls, och sista söndagen i
 * oktober finns den två gånger. Ett företag som stänger glömda stämplingar
 * mitt i natten träffar därför en tidpunkt som antingen saknas eller är
 * tvetydig — och en uträkning som ger NaN eller hänger sig gör att INGEN kunds
 * stämplingar stängs den natten.
 *
 * Testerna nedan kräver inte ett visst svar på vilken sekund som väljs. De
 * kräver att svaret är en giltig tidpunkt som ligger framåt i tiden, vilket är
 * det som avgör om schemajobbet fungerar.
 */
describe("tidsomställningen", () => {
  const valid = (date: Date) =>
    date instanceof Date && !Number.isNaN(date.getTime());

  it("natten då en timme försvinner ger ett giltigt klockslag", () => {
    // 2026 ställs klockan fram natten mot söndag 29 mars: 02:00 blir 03:00.
    const before = new Date("2026-03-29T00:30:00Z");
    const next = nextOccurrenceOf("02:30", before, SE);

    expect(valid(next)).toBe(true);
    expect(next.getTime()).toBeGreaterThan(before.getTime());
  });

  it("natten då en timme upprepas ger ett giltigt klockslag", () => {
    // 2026 ställs klockan tillbaka natten mot söndag 25 oktober.
    const before = new Date("2026-10-24T22:00:00Z");
    const next = nextOccurrenceOf("02:30", before, SE);

    expect(valid(next)).toBe(true);
    expect(next.getTime()).toBeGreaterThan(before.getTime());
  });

  it("18:00 ligger rätt både dagen före och dagen efter omställningen", () => {
    // Vintertid: 18:00 svensk tid är 17:00 UTC.
    expect(
      nextOccurrenceOf("18:00", new Date("2026-03-28T12:00:00Z"), SE).toISOString()
    ).toBe("2026-03-28T17:00:00.000Z");

    // Sommartid dagen efter: samma klockslag på väggen, en timme tidigare UTC.
    expect(
      nextOccurrenceOf("18:00", new Date("2026-03-29T12:00:00Z"), SE).toISOString()
    ).toBe("2026-03-29T16:00:00.000Z");
  });

  it("klockslaget upprepas inte när omställningen passeras", () => {
    // Varje anrop ska ge NÄSTA tillfälle. Två anrop i rad, det andra strax
    // efter det första svaret, får aldrig ge samma tidpunkt igen — då hade
    // schemajobbet stängt samma poster om och om igen den natten.
    const first = nextOccurrenceOf("02:30", new Date("2026-10-24T22:00:00Z"), SE);
    const second = nextOccurrenceOf("02:30", new Date(first.getTime() + 1000), SE);

    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });
});
