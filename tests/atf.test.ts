import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { createDefaultAbsenceReasons, markAbsence } from "@/lib/absence";
import { buildPayrollPeriod } from "@/lib/payroll";
import { buildAtf, isCalendarMonth } from "@/lib/atf";
import {
  atfEarnedMinutes,
  findAgreement,
  workFormFor,
} from "@/lib/collective-agreements";
import { parseMinuteOfDay } from "@/lib/schedule";

/**
 * ATF-UNDERLAGET (2026-10-13).
 *
 * Kundens formel, för en kalendermånad:
 *
 *   (planerad tid + flex föregående månad − ogiltig frånvaro) × 0,0342
 *
 * där 0,0342 är Teknikavtalet IF Metall på dagtid, 82 minuter per 40-timmars
 * vecka. Testen spikar fast formeln, avtalets tal, vilken frånvaro som dras,
 * och att flexledighet inte dras två gånger.
 *
 * September 2026 har 22 vardagar, alltså 176 timmar planerat på ett schema
 * med åtta timmar om dagen.
 */

const TZ = "Europe/Stockholm";
const TEKNIK = "TEKNIK_IF_METALL";

let companyId: string;
let scheduleId: string;
let ordern: string;
let svetsning: string;
let sjuk: string;
let flexledig: string;
let permission: string;

/** Dygnets början en dag 2026, i Stockholm (sommartid, UTC+2). */
const day = (month: number, date: number) =>
  new Date(Date.UTC(2026, month - 1, date, -2, 0));

const at = (month: number, date: number, time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, month - 1, date, hour - 2, minute));
};

/**
 * Mitt på dagen, för perioder. Klockan ställs om 25 oktober, och en midnatt
 * räknad med sommartidens förskjutning hamnar då på fel dag.
 */
const noon = (month: number, date: number) =>
  new Date(Date.UTC(2026, month - 1, date, 10, 0));

const t = (value: string) => parseMinuteOfDay(value)!;

const SEPTEMBER = { from: noon(9, 1), to: noon(9, 30) };

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  companyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Atftest ${unique}`, timezone: TZ },
    })
  ).id;

  scheduleId = (
    await unsafeGlobalPrisma.workSchedule.create({
      data: {
        companyId,
        name: "Normal",
        isDefault: true,
        days: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            companyId,
            weekday,
            startMinute: t("07:00"),
            endMinute: t("15:00"),
          })),
        },
      },
    })
  ).id;

  ordern = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2601" },
    })
  ).id;

  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    })
  ).id;

  await createDefaultAbsenceReasons(forCompany(companyId), companyId);

  const reasons = await unsafeGlobalPrisma.absenceReason.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const byName = (name: string) =>
    reasons.find((reason) => reason.name === name)!.id;

  sjuk = byName("Sjuk");
  flexledig = byName("Flexledig");
  permission = byName("Permission");

  // Kundens val: permission ger ATF. Alla orsaker är utan kryss från början.
  await unsafeGlobalPrisma.absenceReason.update({
    where: { id: permission },
    data: { givesAtf: true },
  });
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Atftest " } },
  });
});

async function employee(data: {
  balanceOpeningDate?: Date;
  hourly?: boolean;
  atfWorkForm?: string;
}): Promise<string> {
  return (
    await unsafeGlobalPrisma.employee.create({
      data: {
        companyId,
        name: "Anna",
        scheduleId: data.hourly ? null : scheduleId,
        // Startdatumet 1 september, så att augusti inte har någon flex. Testen
        // som prövar augustis flex börjar 31 augusti och stämplar den dagen.
        balanceOpeningDate: data.balanceOpeningDate ?? day(9, 1),
        hourly: data.hourly ?? false,
        atfWorkForm: data.atfWorkForm ?? null,
      },
    })
  ).id;
}

async function stamp(employeeId: string, month: number, date: number, from: string, to: string) {
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId,
      kind: "ORDER",
      orderId: ordern,
      momentId: svetsning,
      clockInAt: at(month, date, from),
      clockOutAt: at(month, date, to),
    },
  });
}

async function absence(employeeId: string, date: number, reasonId: string, minutes?: number) {
  await markAbsence(forCompany(companyId), companyId, {
    employeeId,
    date: day(9, date),
    reasonId,
    minutes,
    byEmail: "chef@atftest.se",
  });
}

async function atfFor(employeeId: string, range = SEPTEMBER, agreement: string | null = TEKNIK) {
  const db = forCompany(companyId);
  const period = await buildPayrollPeriod(db, TZ, employeeId, range.from, range.to);
  return buildAtf(db, TZ, period!, agreement);
}

describe("avtalets tal", () => {
  it("dagtid i Teknikavtalet IF Metall är kundens 0,0342", () => {
    const form = workFormFor(findAgreement(TEKNIK)!, null);

    expect(form.label).toBe("Dagtid");
    expect(form.minutesPerWeek / (form.fullTimeHoursPerWeek * 60)).toBeCloseTo(0.0342, 4);

    // En hel vecka ger avtalets 82 minuter, en heltidsmånad om 168 timmar
    // ungefär 5:45.
    expect(atfEarnedMinutes(form, 40 * 60)).toBe(82);
    expect(atfEarnedMinutes(form, 168 * 60)).toBe(344);
  });

  it("tvåskift ger 202 minuter per heltidsvecka", () => {
    const form = workFormFor(findAgreement(TEKNIK)!, "TWO_SHIFT");
    expect(atfEarnedMinutes(form, 40 * 60)).toBe(202);
  });

  it("en okänd form ger avtalets förval, och ett okänt avtal ingenting", () => {
    expect(workFormFor(findAgreement(TEKNIK)!, "FINNS_INTE").key).toBe("DAY");
    expect(findAgreement("FINNS_INTE")).toBeNull();
    expect(findAgreement(null)).toBeNull();
  });

  it("bara en hel kalendermånad räknas som en månad", () => {
    expect(isCalendarMonth(noon(9, 1), noon(9, 30), TZ)).toBe(true);
    // Över omställningen till vintertid och över årsskiftet.
    expect(isCalendarMonth(noon(10, 1), noon(10, 31), TZ)).toBe(true);
    expect(isCalendarMonth(noon(12, 1), noon(12, 31), TZ)).toBe(true);
    expect(isCalendarMonth(noon(9, 1), noon(9, 29), TZ)).toBe(false);
    expect(isCalendarMonth(noon(9, 2), noon(10, 1), TZ)).toBe(false);
    expect(isCalendarMonth(noon(9, 21), noon(9, 27), TZ)).toBe(false);
  });
});

describe("underlaget", () => {
  it("en hel månad utan flex och frånvaro är den planerade tiden", async () => {
    const anna = await employee({});
    const atf = await atfFor(anna);

    expect(atf!.plannedMinutes).toBe(176 * 60);
    expect(atf!.basisMinutes).toBe(176 * 60);
    expect(atf!.earnedMinutes).toBe(Math.round((176 * 60 * 82) / 2400));
  });

  it("flexen tas från FÖREGÅENDE månad, inte från saldot", async () => {
    const anna = await employee({ balanceOpeningDate: day(8, 31) });

    // Måndag 31 augusti: tio timmar mot åtta, alltså +2:00 i augusti.
    await stamp(anna, 8, 31, "07:00", "17:00");

    const atf = await atfFor(anna);
    expect(atf!.previousMonthFlexMinutes).toBe(120);
    expect(atf!.basisMinutes).toBe(176 * 60 + 120);

    // Oktober: septembers flex är −176 timmar (ingenting stämplat), och det
    // är den, inte saldot med augustis +2:00, som räknas.
    const october = await atfFor(anna, { from: noon(10, 1), to: noon(10, 31) });
    expect(october!.previousMonthFlexMinutes).toBe(-176 * 60);
  });

  it("frånvaro utan kryss dras, frånvaro med kryss dras inte", async () => {
    const anna = await employee({});

    await absence(anna, 1, sjuk);
    await absence(anna, 2, permission);

    const atf = await atfFor(anna);
    expect(atf!.invalidAbsenceMinutes).toBe(480);
    expect(atf!.basisMinutes).toBe(176 * 60 - 480);
  });

  it("flexledighet dras inte en gång till, oavsett kryss", async () => {
    const anna = await employee({ balanceOpeningDate: day(8, 31) });

    // Flexledig 31 augusti: augustis flex blir −8:00, och det är där
    // ledigheten syns. Flexledig i september dras inte som frånvaro.
    await markAbsence(forCompany(companyId), companyId, {
      employeeId: anna,
      date: day(8, 31),
      reasonId: flexledig,
      byEmail: "chef@atftest.se",
    });
    await absence(anna, 1, flexledig);

    const atf = await atfFor(anna);
    expect(atf!.previousMonthFlexMinutes).toBe(-480);
    expect(atf!.invalidAbsenceMinutes).toBe(0);
    expect(atf!.basisMinutes).toBe(176 * 60 - 480);
  });

  it("dagar före startdatumet har ingen planerad tid och ingen frånvaro att dra", async () => {
    const anna = await employee({ balanceOpeningDate: day(9, 15) });
    await absence(anna, 7, sjuk);

    const atf = await atfFor(anna);
    // 15–30 september har tolv vardagar.
    expect(atf!.plannedMinutes).toBe(12 * 480);
    expect(atf!.previousMonthFlexMinutes).toBe(0);
    expect(atf!.invalidAbsenceMinutes).toBe(0);
  });

  it("tvåskift räknas med avtalets 202 minuter", async () => {
    const anna = await employee({ atfWorkForm: "TWO_SHIFT" });
    const atf = await atfFor(anna);

    expect(atf!.workFormLabel).toBe("Tvåskift");
    expect(atf!.earnedMinutes).toBe(Math.round((176 * 60 * 202) / 2400));
  });

  it("en timanställd får ATF på arbetad tid och frånvaro som ger ATF", async () => {
    const tim = await employee({ hourly: true });

    await stamp(tim, 9, 1, "07:00", "15:00");
    await stamp(tim, 9, 2, "07:00", "15:00");
    await absence(tim, 3, permission, 240);
    await absence(tim, 4, sjuk, 240);

    const atf = await atfFor(tim);
    expect(atf!.basisMinutes).toBe(960 + 240);
    expect(atf!.earnedMinutes).toBe(Math.round((1200 * 82) / 2400));
  });
});

describe("när ingen ATF visas", () => {
  it("utan valt avtal", async () => {
    const anna = await employee({});
    expect(await atfFor(anna, SEPTEMBER, null)).toBeNull();
  });

  it("för en period som inte är en hel kalendermånad", async () => {
    const anna = await employee({});
    expect(await atfFor(anna, { from: noon(9, 21), to: noon(9, 27) })).toBeNull();
  });
});
