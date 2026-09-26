import { describe, it, expect } from "vitest";
import {
  plannedMinutesForDay,
  plannedMinutesPerWeek,
  parseMinuteOfDay,
  formatMinuteOfDay,
  isoWeekdayIn,
  daysInPeriod,
  type Schedule,
} from "@/lib/schedule";

/**
 * Arbetstidsschemat — planerad tid.
 *
 * Facit är kundens eget schema, ordagrant ur deras mejl:
 *   Mån–Tors 06:30–16:00, frukost 09:00–09:20, lunch 12:00–12:40  → 8,5 h
 *   Fredag   06:30–13:00, frukost 09:00–09:20, fika  11:00–11:10  → 6,0 h
 *   Veckan                                                        → 40,0 h
 *
 * Behöver ingen databas.
 */

const TZ = "Europe/Stockholm";
const t = (value: string) => parseMinuteOfDay(value)!;

const kundens: Schedule = {
  id: "s",
  name: "Normal",
  days: [
    ...[1, 2, 3, 4].map((weekday) => ({
      weekday,
      startMinute: t("06:30"),
      endMinute: t("16:00"),
      breaks: [
        { startMinute: t("09:00"), endMinute: t("09:20"), breakTypeId: null },
        { startMinute: t("12:00"), endMinute: t("12:40"), breakTypeId: null },
      ],
    })),
    {
      weekday: 5,
      startMinute: t("06:30"),
      endMinute: t("13:00"),
      breaks: [
        { startMinute: t("09:00"), endMinute: t("09:20"), breakTypeId: null },
        { startMinute: t("11:00"), endMinute: t("11:10"), breakTypeId: null },
      ],
    },
  ],
};

describe("planerad tid är netto efter rast", () => {
  it("kundens vardag är 8,5 timmar", () => {
    expect(plannedMinutesForDay(kundens, 1)).toBe(8 * 60 + 30);
  });

  it("kundens fredag är 6 timmar", () => {
    expect(plannedMinutesForDay(kundens, 5)).toBe(6 * 60);
  });

  it("kundens vecka är 40 timmar", () => {
    expect(plannedMinutesPerWeek(kundens)).toBe(40 * 60);
  });

  it("de fyra dagarna i kundens tidrapport är 34 timmar", () => {
    const fyra = [1, 2, 3, 4].reduce(
      (sum, weekday) => sum + plannedMinutesForDay(kundens, weekday),
      0
    );
    expect(fyra).toBe(34 * 60);
  });

  it("en dag som saknas i schemat är arbetsfri", () => {
    expect(plannedMinutesForDay(kundens, 6)).toBe(0);
    expect(plannedMinutesForDay(kundens, 7)).toBe(0);
  });

  it("utan schema finns ingen planerad tid", () => {
    expect(plannedMinutesForDay(null, 1)).toBe(0);
  });

  it("en rast som sticker utanför passet dras bara av till den del som ligger inom", () => {
    const kort: Schedule = {
      id: "k",
      name: "Kort",
      days: [
        {
          weekday: 1,
          startMinute: t("08:00"),
          endMinute: t("12:30"),
          breaks: [
            { startMinute: t("12:00"), endMinute: t("13:00"), breakTypeId: null },
          ],
        },
      ],
    };

    // 4,5 timmars pass minus de 30 minuter av rasten som ligger innanför.
    expect(plannedMinutesForDay(kort, 1)).toBe(4 * 60);
  });
});

describe("klockslag", () => {
  it("läser både kolon och punkt", () => {
    expect(parseMinuteOfDay("06:30")).toBe(390);
    expect(parseMinuteOfDay("6.30")).toBe(390);
    expect(parseMinuteOfDay(" 16:00 ")).toBe(960);
  });

  it("avvisar det som inte är ett klockslag", () => {
    expect(parseMinuteOfDay("25:00")).toBeNull();
    expect(parseMinuteOfDay("06:60")).toBeNull();
    expect(parseMinuteOfDay("halv sju")).toBeNull();
    expect(parseMinuteOfDay("")).toBeNull();
  });

  it("skriver tillbaka med nolla först", () => {
    expect(formatMinuteOfDay(390)).toBe("06:30");
    expect(formatMinuteOfDay(0)).toBe("00:00");
    expect(formatMinuteOfDay(960)).toBe("16:00");
  });
});

describe("veckodagar och perioder räknas på väggen", () => {
  it("ISO-veckodag: måndag är 1, söndag är 7", () => {
    // 2019-04-15 var en måndag, 2019-04-21 en söndag.
    expect(isoWeekdayIn(new Date("2019-04-15T08:00:00Z"), TZ)).toBe(1);
    expect(isoWeekdayIn(new Date("2019-04-21T08:00:00Z"), TZ)).toBe(7);
  });

  it("ett kvällspass hör till dagen på väggen, inte till UTC-dagen", () => {
    // 22:30 svensk sommartid är 20:30 UTC samma dag — men 00:30 UTC nästa dag
    // vid 02:30 svensk tid. Det här är tisdagen, inte onsdagen.
    expect(isoWeekdayIn(new Date("2019-04-16T21:30:00Z"), TZ)).toBe(2);
  });

  it("perioden innehåller varje dag, båda ändarna med", () => {
    const days = daysInPeriod(
      new Date("2019-04-15T00:00:00Z"),
      new Date("2019-04-18T00:00:00Z"),
      TZ
    );
    expect(days).toHaveLength(4);
  });

  it("en vecka över en tidsomställning har sju dagar", () => {
    // Sommartid börjar i Sverige sista söndagen i mars.
    const days = daysInPeriod(
      new Date("2019-03-28T00:00:00Z"),
      new Date("2019-04-03T00:00:00Z"),
      TZ
    );
    expect(days).toHaveLength(7);
  });
});
