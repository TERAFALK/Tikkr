import { describe, it, expect } from "vitest";
import { summaryLists, summaryRows } from "@/lib/timesheet-pdf";
import type { PayrollPeriod } from "@/lib/payroll";
import type { AtfBasis } from "@/lib/atf";

/**
 * SAMMANSTÄLLNINGEN PÅ PAPPRET (2026-10-30, kundens begäran).
 *
 * ATF står bara på Löneunderlaget, aldrig på tidrapporten. Flexen från
 * föregående månad står på en egen rad, så att det går att se vad som höjt
 * eller sänkt ATF, och frånvaron summeras per orsak. Ett ATF-uttag är frånvaro
 * på kundens egen orsak, och Tikkr håller inget ATF-saldo.
 *
 * Behöver ingen databas.
 */

function period(overrides: { hourly?: boolean } = {}): PayrollPeriod {
  return {
    employee: { hourly: overrides.hourly ?? false },
    totals: {
      planned: 10080,
      worked: 9600,
      productive: 9000,
      indirect: 600,
      absence: 1440,
      breaks: 600,
      flex: 120,
    },
    flex: { closing: 240 },
    absenceByReason: [
      { reason: "ATF uttag", minutes: 960 },
      { reason: "Sjuk", minutes: 480 },
    ],
    indirectByMoment: [{ name: "Städning", minutes: 600 }],
  } as unknown as PayrollPeriod;
}

const ATF: AtfBasis = {
  agreementName: "Teknikavtalet IF Metall",
  workFormLabel: "Dagtid",
  plannedMinutes: 10080,
  holidayMinutes: 0,
  previousMonthFlexMinutes: -90,
  invalidAbsenceMinutes: 480,
  basisMinutes: 9510,
  earnedMinutes: 325,
};

const cells = (rows: [string, string][][]) =>
  new Map(rows.flat().filter(([label]) => label));

describe("ATF i sammanställningen", () => {
  it("Löneunderlaget visar Intjänad ATF Period", () => {
    const summary = cells(summaryRows(period(), true, ATF));

    expect(summary.get("Intjänad ATF Period")).toBe("5,42");
    expect(summary.get("Underlag ATF")).toBe("158,5");
    expect(summary.has("Intjänad ATF")).toBe(false);
  });

  it("Löneunderlaget visar flexen från föregående månad med sitt tecken", () => {
    const summary = cells(summaryRows(period(), true, ATF));

    expect(summary.get("Flex föregående månad")).toBe("-1,5");
  });

  it("tidrapporten visar ingen ATF, även när underlaget finns", () => {
    const labels = [...cells(summaryRows(period(), false, ATF)).keys()];

    expect(labels.filter((label) => /ATF|föregående/.test(label))).toEqual([]);
  });

  it("utan ATF-underlag står inga ATF-rader på Löneunderlaget", () => {
    const labels = [...cells(summaryRows(period(), true, null)).keys()];

    expect(labels.filter((label) => /ATF|föregående/.test(label))).toEqual([]);
  });

  it("en timanställd har ingen flexrad, eftersom flexen inte ingår", () => {
    const summary = cells(summaryRows(period({ hourly: true }), true, ATF));

    expect(summary.has("Flex föregående månad")).toBe(false);
    expect(summary.has("Intjänad ATF Period")).toBe(true);
  });
});

describe("listorna under sammanställningen", () => {
  it("Löneunderlaget summerar frånvaron per orsak, så att ATF-uttaget syns", () => {
    const absence = summaryLists(period(), true).find(
      (list) => list.title === "Frånvaro per orsak"
    );

    expect(absence?.rows).toEqual([
      ["ATF uttag", "16"],
      ["Sjuk", "8"],
    ]);
  });

  it("tidrapporten har ingen frånvarolista, raderna visar redan frånvaron", () => {
    const titles = summaryLists(period(), false).map((list) => list.title);

    expect(titles).toEqual(["Improduktiv tid"]);
  });

  it("en lista utan rader ritas inte", () => {
    const empty = {
      ...period(),
      absenceByReason: [],
      indirectByMoment: [],
    } as PayrollPeriod;

    expect(summaryLists(empty, true)).toEqual([]);
  });
});
