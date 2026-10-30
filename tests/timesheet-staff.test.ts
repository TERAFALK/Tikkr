import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { createDefaultAbsenceReasons } from "@/lib/absence";
import { employeesForTimesheet } from "@/lib/payroll";

/**
 * VILKA SOM KOMMER MED NÄR HELA PERSONALEN SKRIVS UT (2026-10-30).
 *
 * Utskrifterna tog bara med dem som är aktiva IDAG. Med en vald period betyder
 * det att den som slutat i april saknas på löneunderlaget för mars, utan att
 * något på pappret säger det. Den som har tid i perioden ska med, vad personen
 * än har för läge nu.
 */

const TZ = "Europe/Stockholm";

let companyId: string;
let otherCompanyId: string;
let ordern: string;
let svetsning: string;
let sjuk: string;

/**
 * Dygnets början, en dag i mars 2026, i Stockholm (vintertid, UTC+1). Klockan
 * ställs om den 29:e, så den 31:a blir en timme sen, vilket inte flyttar dagen.
 */
const day = (date: number) => new Date(Date.UTC(2026, 2, date, -1, 0));

/** "15:30" en dag i mars 2026, i Stockholm. */
const at = (date: number, time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 2, date, hour - 1, minute));
};

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  companyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Utskriftstest ${unique}`, timezone: TZ },
    })
  ).id;

  otherCompanyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Utskriftstest annan ${unique}`, timezone: TZ },
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

  sjuk = (await unsafeGlobalPrisma.absenceReason.findFirstOrThrow({
    where: { companyId, name: "Sjuk" },
    select: { id: true },
  })).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Utskriftstest " } },
  });
});

async function employee(name: string, active: boolean): Promise<string> {
  const created = await unsafeGlobalPrisma.employee.create({
    data: { companyId, name, active },
  });
  return created.id;
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

async function absent(employeeId: string, date: number) {
  await unsafeGlobalPrisma.absence.create({
    data: {
      companyId,
      employeeId,
      date: day(date),
      reasonId: sjuk,
      minutes: 480,
      createdByEmail: "ansvarig@example.se",
    },
  });
}

/** Hela mars. */
const march = () =>
  employeesForTimesheet(forCompany(companyId), TZ, day(1), day(31));

describe("employeesForTimesheet", () => {
  it("tar med varje aktiv anställd, även utan tid i perioden", async () => {
    const anna = await employee("Anna", true);

    expect(await march()).toEqual([anna]);
  });

  it("tar med den som slutat men har stämplat i perioden", async () => {
    const slutat = await employee("Slutat", false);
    await stamp(slutat, 10, "07:00", "15:00");

    expect(await march()).toEqual([slutat]);
  });

  it("tar med den som slutat men har frånvaro i perioden", async () => {
    const sjukskriven = await employee("Sjukskriven", false);
    await absent(sjukskriven, 10);

    expect(await march()).toEqual([sjukskriven]);
  });

  it("lämnar den som slutat och bara har tid utanför perioden", async () => {
    const tidigare = await employee("Tidigare", false);
    await stamp(tidigare, 10, "07:00", "15:00");
    await absent(tidigare, 11);

    const db = forCompany(companyId);

    expect(await employeesForTimesheet(db, TZ, day(12), day(13))).toEqual([]);
  });

  it("räknar hela dygn, även när datumet kommer ur adressen och landar 12:00", async () => {
    const sista = await employee("Sista dagen", false);
    const dagen = await employee("Dagen efter", false);
    await stamp(sista, 31, "15:30", "16:00");
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: dagen,
        kind: "ORDER",
        orderId: ordern,
        momentId: svetsning,
        clockInAt: new Date(Date.UTC(2026, 3, 1, 5, 0)),
        clockOutAt: new Date(Date.UTC(2026, 3, 1, 6, 0)),
      },
    });

    const db = forCompany(companyId);
    const noon = (date: number) => new Date(Date.UTC(2026, 2, date, 11, 0));

    expect(await employeesForTimesheet(db, TZ, noon(1), noon(31))).toEqual([
      sista,
    ]);
  });

  it("står i bokstavsordning och tar med varje person en gång", async () => {
    const bertil = await employee("Bertil", false);
    const anna = await employee("Anna", true);
    await stamp(bertil, 10, "07:00", "15:00");
    await absent(bertil, 11);
    await stamp(anna, 10, "07:00", "15:00");

    expect(await march()).toEqual([anna, bertil]);
  });

  it("tar aldrig med en annan kunds anställd", async () => {
    await unsafeGlobalPrisma.employee.create({
      data: { companyId: otherCompanyId, name: "Annan kund", active: true },
    });

    expect(await march()).toEqual([]);
  });
});
