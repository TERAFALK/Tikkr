import { describe, it, expect } from "vitest";
import {
  COLLAPSED_DAY_WIDTH,
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
const WEEKDAYS = [0, 1, 2, 3, 4].map((index) => ({ index, collapsed: false }));

describe("vilka dagar som ritas", () => {
  const none = [false, false, false, false, false, false, false];

  it("helgen är alltid med, hopfälld när den är tom", () => {
    const plans = plannedDays({ open: none, used: none, todayIndex: null, focus: null });

    expect(plans.map((plan) => plan.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plans.filter((plan) => plan.collapsed).map((plan) => plan.index)).toEqual([5, 6]);
  });

  it("en helgdag fälls ut när det är den dagen", () => {
    // En vecka som pågår en lördag ska visa lördagen.
    const plans = plannedDays({ open: none, used: none, todayIndex: 5, focus: null });
    expect(plans[5].collapsed).toBe(false);
    expect(plans[6].collapsed).toBe(true);
  });

  it("en helgdag fälls ut när något ligger där eller någon har tider", () => {
    const used = [...none];
    used[6] = true;
    const open = [...none];
    open[5] = true;

    const plans = plannedDays({ open, used, todayIndex: null, focus: null });
    expect(plans[5].collapsed).toBe(false);
    expect(plans[6].collapsed).toBe(false);
  });

  it("en vardag fälls aldrig ihop", () => {
    const plans = plannedDays({ open: none, used: none, todayIndex: null, focus: null });
    expect(plans.slice(0, 5).every((plan) => !plan.collapsed)).toBe(true);
  });

  it("dagvyn visar bara den valda dagen", () => {
    expect(plannedDays({ open: none, used: none, todayIndex: 2, focus: 6 })).toEqual([
      { index: 6, collapsed: false },
    ]);
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

  it("en hopfälld dag har sin egen bredd", () => {
    const columns = layoutDays(
      [...WEEKDAYS, { index: 5, collapsed: true }],
      axisOf,
      0.5
    );

    expect(columns[5].width).toBe(COLLAPSED_DAY_WIDTH);
  });

  it("bredderna är hela pixlar", () => {
    const columns = layoutDays(WEEKDAYS, axisOf, 0.333);
    expect(columns.every((column) => Number.isInteger(column.width))).toBe(true);
  });

  it("skalan fyller bredden, skiljelinjer och hopfällda dagar inräknade", () => {
    const plans = [...WEEKDAYS, { index: 5, collapsed: true }, { index: 6, collapsed: true }];
    const available = 5 * 720 * 0.5 + 7 * DAY_BORDER + 2 * COLLAPSED_DAY_WIDTH;

    const scale = fitScale({ available, plans, axisOf, floor: 0.1 });
    expect(scale).toBeCloseTo(0.5);
    expect(layoutWidth(layoutDays(plans, axisOf, scale))).toBeLessThanOrEqual(available);
  });

  it("en hel vecka ryms på en vanlig skärm, utan rullning", () => {
    // Felet 2026-10-17: med axeln 06–18 och lördagen utfälld blev veckan
    // bredare än skärmen, golvet slog till, och söndagen hamnade utanför
    // kanten. En tavla på 1100 pixlar, varav 160 är namnkolumnen.
    const available = 1100 - 160;
    const allDays = [0, 1, 2, 3, 4, 5, 6].map((index) => ({ index, collapsed: false }));

    const scale = fitScale({ available, plans: allDays, axisOf, floor: WEEK_SCALE_FLOOR });
    expect(layoutWidth(layoutDays(allDays, axisOf, scale))).toBeLessThanOrEqual(available);
  });

  it("avrundningen gör aldrig veckan bredare än bredden", () => {
    // Varje dag avrundad uppåt gav upp till en pixel för mycket per dag, och
    // en rullningslist för fem pixlar.
    const plans = [...WEEKDAYS, { index: 5, collapsed: true }, { index: 6, collapsed: true }];

    for (const available of [701, 913, 1037, 1281, 1499]) {
      const scale = fitScale({ available, plans, axisOf, floor: 0.01 });
      const width = layoutWidth(layoutDays(plans, axisOf, scale, available));

      expect(width).toBeLessThanOrEqual(available);
    }
  });

  it("veckan fyller bredden exakt, utan vit rand i kanten", () => {
    // Nedåt avrundat blev det upp till en pixel över per dag, och raderna
    // slutade före tavlans kant med en vit strimma efter söndagen. Pixlarna
    // som blir över delas ut på dagarna, en var.
    const plans = [...WEEKDAYS, { index: 5, collapsed: false }, { index: 6, collapsed: true }];

    for (const available of [701, 913, 1037, 1281, 1499]) {
      const scale = fitScale({ available, plans, axisOf, floor: 0.01 });
      const columns = layoutDays(plans, axisOf, scale, available);

      expect(layoutWidth(columns)).toBe(available);
      // Ingen dag får mer än en pixel extra.
      const widths = columns.filter((column) => !column.collapsed).map((column) => column.width);
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

  it("en hopfälld dag tar inte emot ett jobb", () => {
    const withWeekend = layoutDays(
      [...WEEKDAYS, { index: 5, collapsed: true }],
      axisOf,
      scale
    );
    expect(dayAt(withWeekend, withWeekend[5].left + 10, axisOf, scale, 15)).toBeNull();
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
