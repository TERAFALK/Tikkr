import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { createDefaultAbsenceReasons, markAbsence } from "@/lib/absence";
import { buildPayrollPeriod, currentFlexMinutes } from "@/lib/payroll";
import { buildAtf } from "@/lib/atf";
import { addHoliday, HolidayError, removeHoliday } from "@/lib/holidays";
import { parseMinuteOfDay } from "@/lib/schedule";

/**
 * RÖDA DAGAR (2026-10-13).
 *
 * Kundens egen lista. En röd dag har ingen planerad tid: den som är ledig
 * tappar ingenting i flex, och den som arbetar får tiden som plus. ATF ska
 * däremot inte minska av en helgdag.
 */

const TZ = "Europe/Stockholm";

let companyId: string;
let otherCompanyId: string;
let scheduleId: string;
let ordern: string;
let svetsning: string;
let sjuk: string;

/** Dygnets början en dag i september 2026, i Stockholm (sommartid, UTC+2). */
const day = (date: number) => new Date(Date.UTC(2026, 8, date, -2, 0));

const at = (date: number, time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, date, hour - 2, minute));
};

const t = (value: string) => parseMinuteOfDay(value)!;

// Måndag 21 och tisdag 22 september 2026.
const MONDAY = 21;
const TUESDAY = 22;

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  companyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Helgtest ${unique}`, timezone: TZ },
    })
  ).id;
  otherCompanyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Helgtest grannen ${unique}`, timezone: TZ },
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
    await unsafeGlobalPrisma.order.create({ data: { companyId, orderNumber: "2601" } })
  ).id;
  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({ data: { companyId, name: "Svetsning" } })
  ).id;

  await createDefaultAbsenceReasons(forCompany(companyId), companyId);
  sjuk = (
    await unsafeGlobalPrisma.absenceReason.findFirstOrThrow({
      where: { companyId, name: "Sjuk" },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Helgtest " } },
  });
});

async function employee(balanceOpeningDate: Date = day(1)): Promise<string> {
  return (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna", scheduleId, balanceOpeningDate },
    })
  ).id;
}

async function stamp(employeeId: string, date: number, from: string, to: string) {
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId,
      kind: "ORDER",
      orderId: ordern,
      momentId: svetsning,
      clockInAt: at(date, from),
      clockOutAt: at(date, to),
    },
  });
}

const red = (date: number, name = "Röd dag") =>
  addHoliday(forCompany(companyId), companyId, {
    date: day(date),
    name,
    byEmail: "chef@helgtest.se",
  });

async function period(employeeId: string, from: number, to: number) {
  return (await buildPayrollPeriod(forCompany(companyId), TZ, employeeId, day(from), day(to)))!;
}

describe("planerad tid och flex", () => {
  it("en röd dag utan stämpling har ingen planerad tid och ingen flex", async () => {
    const anna = await employee();
    await red(MONDAY, "Klämdag");

    const monday = await period(anna, MONDAY, MONDAY);

    expect(monday.days[0].holiday).toEqual({ name: "Klämdag", minutes: 480 });
    expect(monday.totals.planned).toBe(0);
    expect(monday.totals.flex).toBe(0);
  });

  it("arbete en röd dag blir plus i flex", async () => {
    const anna = await employee();
    await red(MONDAY);
    await stamp(anna, MONDAY, "07:00", "15:00");

    expect((await period(anna, MONDAY, MONDAY)).totals.flex).toBe(480);
  });

  it("frånvaro utan timmar en röd dag täcker noll", async () => {
    const anna = await employee();
    await red(MONDAY);
    await markAbsence(forCompany(companyId), companyId, {
      employeeId: anna,
      date: day(MONDAY),
      reasonId: sjuk,
      byEmail: "chef@helgtest.se",
    });

    const monday = await period(anna, MONDAY, MONDAY);
    expect(monday.totals.absence).toBe(0);
    expect(monday.totals.flex).toBe(0);
  });

  it("räknas också i saldot före perioden, och skärmen visar samma tal", async () => {
    const anna = await employee(day(MONDAY));
    await red(MONDAY);
    await stamp(anna, TUESDAY, "07:00", "15:00");

    // Utan den röda dagen hade måndagen gett −8:00 i det ingående saldot.
    const tuesday = await period(anna, TUESDAY, TUESDAY);
    expect(tuesday.flex.opening).toBe(0);
    expect(tuesday.flex.closing).toBe(0);

    expect(
      await currentFlexMinutes(forCompany(companyId), TZ, anna, at(TUESDAY, "23:00"))
    ).toBe(0);
  });

  it("en annan kunds röda dag påverkar inte", async () => {
    const anna = await employee();
    await addHoliday(forCompany(otherCompanyId), otherCompanyId, {
      date: day(MONDAY),
      name: "Deras dag",
      byEmail: "chef@grannen.se",
    });

    const monday = await period(anna, MONDAY, MONDAY);
    expect(monday.days[0].holiday).toBeNull();
    expect(monday.totals.planned).toBe(480);
  });
});

describe("ATF-underlaget", () => {
  it("minskar inte av en röd dag", async () => {
    const anna = await employee();
    await red(MONDAY);

    const db = forCompany(companyId);
    // Mitt på dagen: perioden kapas till hela dygn ändå, se buildPayrollPeriod.
    const september = await buildPayrollPeriod(
      db,
      TZ,
      anna,
      new Date(Date.UTC(2026, 8, 1, 10)),
      new Date(Date.UTC(2026, 8, 30, 10))
    );
    const atf = await buildAtf(db, TZ, september!, "TEKNIK_IF_METALL");

    // September 2026 har 22 vardagar, alltså 176 timmar enligt schemat.
    expect(atf!.plannedMinutes).toBe(176 * 60 - 480);
    expect(atf!.holidayMinutes).toBe(480);
    expect(atf!.basisMinutes).toBe(176 * 60);
  });
});

describe("listan", () => {
  it("samma dag två gånger byter namn i stället för att lägga till en dag", async () => {
    await red(MONDAY, "Klämdag");
    await red(MONDAY, "Klämdag efter Kristi himmelsfärd");

    const rows = await unsafeGlobalPrisma.holiday.findMany({ where: { companyId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Klämdag efter Kristi himmelsfärd");

    const events = await forCompany(companyId).auditEvent.findMany({
      where: { entity: "Holiday" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual(["create", "update"]);
  });

  it("ett tomt namn avvisas", async () => {
    await expect(red(MONDAY, "  ")).rejects.toThrow(HolidayError);
  });

  it("tas bort med en rad i loggen, och en annan kunds dag går inte att ta bort", async () => {
    await red(MONDAY);
    const row = await unsafeGlobalPrisma.holiday.findFirstOrThrow({ where: { companyId } });

    await removeHoliday(forCompany(otherCompanyId), row.id, "chef@grannen.se");
    expect(await unsafeGlobalPrisma.holiday.count({ where: { companyId } })).toBe(1);

    await removeHoliday(forCompany(companyId), row.id, "chef@helgtest.se");
    expect(await unsafeGlobalPrisma.holiday.count({ where: { companyId } })).toBe(0);

    const deleted = await forCompany(companyId).auditEvent.findFirstOrThrow({
      where: { entity: "Holiday", action: "delete" },
    });
    expect(deleted.actorEmail).toBe("chef@helgtest.se");
  });
});
