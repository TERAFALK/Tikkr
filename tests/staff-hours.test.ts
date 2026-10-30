import { describe, it, expect } from "vitest";
import {
  hoursForEmployee,
  hoursOnDay,
  outsideHours,
  overlappingPasses,
  type StaffHoursSet,
} from "@/lib/staff-hours";
import type { StationHours } from "@/lib/plan-calendar";

/**
 * PERSONALENS ARBETSTIDER (fas 3 av issue #21). Behöver ingen databas.
 *
 * Tre saker får inte bli fel:
 *
 *  1. VEMS TIDER SOM GÄLLER. Egna går före företagets standard, och utan
 *     någon av dem finns inga tider alls, vilket är något annat än "ledig".
 *  2. UTANFÖR ARBETSTID. En varning, aldrig ett hinder, och ett pass som går
 *     över lunchen ligger inte utanför: det hoppar över rasten.
 *  3. DUBBELBOKNING. Bara samma person, och ett pass som slutar när nästa
 *     börjar krockar inte.
 */

const SE = "Europe/Stockholm";

/** Mån–fre 07:00–16:00 med lunch 12:00–12:40. */
const WEEKDAYS: StationHours[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 7 * 60,
  endMinute: 16 * 60,
  breaks: [{ startMinute: 12 * 60, endMinute: 12 * 60 + 40 }],
}));

/** Halvtid: måndag och tisdag 07:00–12:00. */
const PART_TIME: StationHours[] = [1, 2].map((weekday) => ({
  weekday,
  startMinute: 7 * 60,
  endMinute: 12 * 60,
  breaks: [],
}));

/** Måndag 5 oktober 2026, klockslag i svensk tid (UTC+2). */
function at(hour: number, minute = 0, day = 5): Date {
  return new Date(Date.UTC(2026, 9, day, hour - 2, minute));
}

describe("vems tider som gäller", () => {
  const set: StaffHoursSet = {
    standard: WEEKDAYS,
    own: new Map([["anna", PART_TIME]]),
  };

  it("egna tider går före företagets standard", () => {
    expect(hoursForEmployee(set, "anna")).toBe(PART_TIME);
  });

  it("utan egna tider gäller standarden", () => {
    expect(hoursForEmployee(set, "bertil")).toBe(WEEKDAYS);
  });

  it("utan standard och egna tider finns inga tider", () => {
    const empty: StaffHoursSet = { standard: [], own: new Map() };
    expect(hoursForEmployee(empty, "bertil")).toBeNull();
  });

  it("inga tider och en ledig dag är olika svar", () => {
    // Inga tider alls: väggklockan gäller, som före fas 3.
    expect(hoursOnDay(null, at(8), SE)).toBeUndefined();
    // Tider, men inte på onsdagar: personen är ledig.
    expect(hoursOnDay(PART_TIME, at(8, 0, 7), SE)).toBeNull();
    expect(hoursOnDay(PART_TIME, at(8), SE)?.weekday).toBe(1);
  });
});

describe("utanför arbetstid", () => {
  it("ett pass inom dagen ligger inte utanför", () => {
    expect(outsideHours(WEEKDAYS, at(8), 120, SE)).toBe(false);
  });

  it("ett pass över lunchen ligger inte utanför", () => {
    // 10:00 och fyra timmar slutar 14:40, eftersom lunchen hoppas över.
    expect(outsideHours(WEEKDAYS, at(10), 240, SE)).toBe(false);
  });

  it("ett pass som slutar precis när dagen slutar ligger inte utanför", () => {
    // 12:40 till 16:00 är 3 timmar och 20 minuter arbete.
    expect(outsideHours(WEEKDAYS, at(12, 40), 200, SE)).toBe(false);
  });

  it("ett pass som börjar före dagen ligger utanför", () => {
    expect(outsideHours(WEEKDAYS, at(6), 120, SE)).toBe(true);
  });

  it("ett pass som slutar efter dagen ligger utanför", () => {
    expect(outsideHours(WEEKDAYS, at(14), 180, SE)).toBe(true);
  });

  it("ett pass en ledig dag ligger utanför", () => {
    // Halvtid måndag och tisdag. Onsdag är ledig.
    expect(outsideHours(PART_TIME, at(8, 0, 7), 60, SE)).toBe(true);
    // Lördag för den som går vardagar.
    expect(outsideHours(WEEKDAYS, at(8, 0, 10), 60, SE)).toBe(true);
  });

  it("utan några tider finns ingenting att vara utanför", () => {
    expect(outsideHours(null, at(5), 600, SE)).toBe(false);
  });
});

describe("dubbelbokning", () => {
  const hoursOf = () => WEEKDAYS;

  it("två pass samtidigt för samma person krockar", () => {
    const overlapping = overlappingPasses(
      [
        { id: "a", employeeId: "anna", startsAt: at(8), minutes: 120 },
        { id: "b", employeeId: "anna", startsAt: at(9), minutes: 60 },
      ],
      hoursOf,
      SE
    );

    expect([...overlapping].sort()).toEqual(["a", "b"]);
  });

  it("ett pass som slutar när nästa börjar krockar inte", () => {
    expect(
      overlappingPasses(
        [
          { id: "a", employeeId: "anna", startsAt: at(8), minutes: 60 },
          { id: "b", employeeId: "anna", startsAt: at(9), minutes: 60 },
        ],
        hoursOf,
        SE
      ).size
    ).toBe(0);
  });

  it("två personer samtidigt krockar inte", () => {
    expect(
      overlappingPasses(
        [
          { id: "a", employeeId: "anna", startsAt: at(8), minutes: 120 },
          { id: "b", employeeId: "bertil", startsAt: at(8), minutes: 120 },
        ],
        hoursOf,
        SE
      ).size
    ).toBe(0);
  });

  it("lunchen förlänger passet på väggen, och då krockar det", () => {
    // 11:00 och två timmar slutar 13:40 över lunchen, och ett pass 13:00
    // ligger då i det. Utan rasten hade de bara mötts.
    const passes = [
      { id: "a", employeeId: "anna", startsAt: at(11), minutes: 120 },
      { id: "b", employeeId: "anna", startsAt: at(13), minutes: 60 },
    ];

    expect(overlappingPasses(passes, hoursOf, SE).size).toBe(2);
    expect(overlappingPasses(passes, () => null, SE).size).toBe(0);
  });
});
