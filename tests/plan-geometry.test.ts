import { describe, it, expect } from "vitest";
import {
  DAY_BORDER,
  WEEK_SCALE_FLOOR,
  axisLabels,
  dayAt,
  fitScale,
  hourLines,
  layoutDays,
  layoutWidth,
  minuteX,
  plannedDays,
  stepDays,
  type DayAxis,
} from "@/lib/plan-geometry";

/**
 * TAVLANS MÅTT. Behöver ingen databas och ritar ingenting.
 *
 * Felen som gav filen syntes bara som att något var lite fel: klockslagen
 * stod bredvid sina linjer, slutet av varje dag kapades, och ett tryck på
 * fredag hamnade några minuter fel. Testerna här håller rubrik, rutnät och
 * träffyta på samma mått.
 */

const DAY: DayAxis = { startMinute: 6 * 60, endMinute: 18 * 60 };
const axisOf = () => DAY;
const WEEKDAYS = [0, 1, 2, 3, 4].map((index) => ({ index }));
const WEEK = [0, 1, 2, 3, 4, 5, 6].map((index) => ({ index }));

describe("vilka dagar som ritas", () => {
  it("helgen är dold som standard", () => {
    // Produktägarens val 2026-10-17: en knapp visar och döljer helgen, och
    // utan den syns måndag till fredag.
    expect(plannedDays(null, false)).toEqual(WEEKDAYS);
  });

  it("alla sju, som hela dagar, när helgen visas", () => {
    // En tom helgdag stod en kort tid som en smal kolumn utan tidslinje, och
    // såg avkapad ut bredvid en hel dag.
    expect(plannedDays(null, true)).toEqual(WEEK);
  });

  it("dagvyn visar den valda dagen, även en helgdag när helgen är dold", () => {
    expect(plannedDays(6, false)).toEqual([{ index: 6 }]);
    expect(plannedDays(2, true)).toEqual([{ index: 2 }]);
  });
});

describe("dagvyns pilar", () => {
  it("hoppar över helgen när den är dold", () => {
    // Fredag och nästa dag är måndag, tre dagar fram.
    expect(stepDays(4, 1, false)).toBe(3);
    // Måndag och föregående dag är fredag, tre dagar bak.
    expect(stepDays(0, -1, false)).toBe(-3);
  });

  it("går en dag i taget när helgen visas", () => {
    expect(stepDays(4, 1, true)).toBe(1);
    expect(stepDays(0, -1, true)).toBe(-1);
  });

  it("går en dag i taget mitt i veckan", () => {
    expect(stepDays(1, 1, false)).toBe(1);
    expect(stepDays(3, -1, false)).toBe(-1);
  });

  it("lämnar en helgdag åt rätt håll när helgen är dold", () => {
    // Den som öppnat en lördag i dagvyn och går framåt ska till måndag,
    // och bakåt till fredag.
    expect(stepDays(5, 1, false)).toBe(2);
    expect(stepDays(5, -1, false)).toBe(-1);
    expect(stepDays(6, -1, false)).toBe(-2);
  });
});

describe("var dagarna ligger", () => {
  it("varje dag börjar efter sin skiljelinje", () => {
    const columns = layoutDays(WEEKDAYS, axisOf, 0.5);

    // Tolv timmar à 0,5 px per minut.
    expect(columns[0]).toMatchObject({ left: DAY_BORDER, width: 360 });
    expect(columns[1].left).toBe(DAY_BORDER + 360 + DAY_BORDER);
    expect(layoutWidth(columns)).toBe(5 * (DAY_BORDER + 360));
  });

  it("bredderna är hela pixlar", () => {
    const columns = layoutDays(WEEKDAYS, axisOf, 0.333);
    expect(columns.every((column) => Number.isInteger(column.width))).toBe(true);
  });

  it("skalan fyller bredden, skiljelinjerna inräknade", () => {
    const available = 7 * 720 * 0.5 + 7 * DAY_BORDER;

    const scale = fitScale({ available, plans: WEEK, axisOf, floor: 0.1 });
    expect(scale).toBeCloseTo(0.5);
    expect(layoutWidth(layoutDays(WEEK, axisOf, scale, available))).toBe(available);
  });

  it("en hel vecka ryms på en vanlig skärm, utan rullning", () => {
    // Felet 2026-10-17: med axeln 06–18 och helgen med blev veckan bredare
    // än skärmen, golvet slog till, och söndagen hamnade utanför kanten. En
    // tavla på 1100 pixlar, varav 160 är namnkolumnen.
    const available = 1100 - 160;

    const scale = fitScale({ available, plans: WEEK, axisOf, floor: WEEK_SCALE_FLOOR });
    expect(layoutWidth(layoutDays(WEEK, axisOf, scale, available))).toBe(available);
  });

  it("avrundningen gör aldrig veckan bredare än bredden", () => {
    // Varje dag avrundad uppåt gav upp till en pixel för mycket per dag, och
    // en rullningslist för fem pixlar.
    for (const available of [701, 913, 1037, 1281, 1499]) {
      const scale = fitScale({ available, plans: WEEK, axisOf, floor: 0.01 });
      const width = layoutWidth(layoutDays(WEEK, axisOf, scale, available));

      expect(width).toBeLessThanOrEqual(available);
    }
  });

  it("veckan fyller bredden exakt, utan vit rand i kanten", () => {
    // Nedåt avrundat blev det upp till en pixel över per dag, och raderna
    // slutade före tavlans kant med en vit strimma efter söndagen. Pixlarna
    // som blir över delas ut på dagarna, en var.
    for (const available of [701, 913, 1037, 1281, 1499]) {
      const scale = fitScale({ available, plans: WEEK, axisOf, floor: 0.01 });
      const columns = layoutDays(WEEK, axisOf, scale, available);

      expect(layoutWidth(columns)).toBe(available);
      // Ingen dag får mer än en pixel extra.
      const widths = columns.map((column) => column.width);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    }
  });

  it("en vecka som inte ryms fylls inte ut", () => {
    // Under golvet rullar tavlan, och då finns inga pixlar över att dela ut.
    const scale = fitScale({ available: 300, plans: WEEKDAYS, axisOf, floor: 0.25 });
    const columns = layoutDays(WEEKDAYS, axisOf, scale, 300);

    expect(columns.every((column) => column.width === 180)).toBe(true);
  });

  it("skalan går aldrig under golvet", () => {
    expect(fitScale({ available: 100, plans: WEEKDAYS, axisOf, floor: 0.25 })).toBe(0.25);
  });
});

describe("vad ett tryck träffar", () => {
  const scale = 0.5;
  const columns = layoutDays(WEEKDAYS, axisOf, scale);

  it("dagens första pixel är dagens början", () => {
    expect(dayAt(columns, columns[0].left, axisOf, scale, 15)).toEqual({
      index: 0,
      minute: 6 * 60,
    });
  });

  it("dagens sista pixel är dagens sista kvart, inte nästa dag", () => {
    // Felet: skiljelinjen räknades utanför dagen, och slutet av dagen hamnade
    // i fel kolumn eller ingenstans.
    const last = columns[0].left + columns[0].width - 1;
    expect(dayAt(columns, last, axisOf, scale, 15)).toEqual({
      index: 0,
      minute: 18 * 60 - 15,
    });
  });

  it("fredag träffar samma klockslag som måndag", () => {
    // Felet: varje dag gled två pixlar, och på fredag var det åtta.
    const at = (index: number) =>
      dayAt(columns, columns[index].left + minuteX(DAY, 10 * 60, scale), axisOf, scale, 15);

    expect(at(0)).toEqual({ index: 0, minute: 10 * 60 });
    expect(at(4)).toEqual({ index: 4, minute: 10 * 60 });
  });

  it("skiljelinjen träffar ingenting", () => {
    expect(dayAt(columns, columns[1].left - 1, axisOf, scale, 15)).toBeNull();
  });

  it("söndagens sista pixel är söndag", () => {
    const week = layoutDays(WEEK, axisOf, scale);
    const last = week[6].left + week[6].width - 1;

    expect(dayAt(week, last, axisOf, scale, 15)?.index).toBe(6);
  });
});

describe("klockslagen i rubriken", () => {
  it("står på samma x-läge som timlinjerna", () => {
    // Felet: rubriken hade en inre marginal som rutnätet inte hade, och "09"
    // stod till höger om 09-linjen.
    const labels = axisLabels(DAY, 1);
    const lines = hourLines(DAY).map((minute) => minuteX(DAY, minute, 1));

    for (const label of labels) {
      expect(lines).toContain(label.x);
    }
  });

  it("hamnar aldrig utanför dagen", () => {
    for (const scale of [0.2, 0.3, 0.5, 1, 2]) {
      const width = 720 * scale;

      for (const label of axisLabels(DAY, scale)) {
        expect(label.x).toBeGreaterThanOrEqual(10);
        expect(width - label.x).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("glesas ut när timmarna blir smala", () => {
    expect(axisLabels(DAY, 1).map((label) => label.minute % 60)).toEqual(
      axisLabels(DAY, 1).map(() => 0)
    );
    const sparse = axisLabels(DAY, 0.3).map((label) => label.minute);
    expect(sparse.every((minute) => minute % 180 === 0)).toBe(true);
  });

  it("timlinjerna står inte på dagens kanter", () => {
    expect(hourLines(DAY)).not.toContain(DAY.startMinute);
    expect(hourLines(DAY)).not.toContain(DAY.endMinute);
  });
});
