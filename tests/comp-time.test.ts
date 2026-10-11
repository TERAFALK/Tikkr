import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  AbsenceError,
  addCompEarned,
  createDefaultAbsenceReasons,
  markAbsence,
  removeAbsence,
  removeCompAdjustment,
} from "@/lib/absence";
import { buildPayrollPeriod } from "@/lib/payroll";
import { parseMinuteOfDay } from "@/lib/schedule";

/**
 * KOMPTIDEN — DET SOM KNAPPARNA PÅ TIDRAPPORTEN SKRIVER OCH TAR BORT.
 *
 * Åtgärderna fanns från 2026-09-26 men hade ingen knapp förrän 2026-10-10.
 * Komptidssaldot kunde därmed aldrig öka, och inget av det här var prövat
 * genom något gränssnitt. Testerna spikar fast reglerna innan knapparna
 * börjar användas:
 *
 *   - Intjänad komp flyttar minuter ur dagens flex och in i komptidsboken,
 *     och tillbaka när raden tas bort.
 *   - En timanställd har ingen komptid, och avvisas i biblioteket.
 *   - Ett uttag som en frånvaro skrivit hör till frånvaron och tas bara bort
 *     med den.
 *   - Varje rad och borttagning loggas, och ett id från en annan kund gör
 *     ingenting.
 */

const TZ = "Europe/Stockholm";

let companyId: string;
let anna: string;
let tim: string;
let ordern: string;
let svetsning: string;
let sjuk: string;
let kompUttag: string;

/** Måndag 2026-09-21, vid dygnets början i Stockholm (sommartid, UTC+2). */
const monday = new Date("2026-09-20T22:00:00Z");

/** "07:00" på måndagen, i Stockholm. */
const at = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, 21, hour - 2, minute));
};

const t = (value: string) => parseMinuteOfDay(value)!;

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  companyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Komptest ${unique}`, timezone: TZ },
    })
  ).id;

  // Måndag till fredag 07:00-15:00 utan raster: åtta timmar planerat.
  const schedule = await unsafeGlobalPrisma.workSchedule.create({
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
  });

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna", scheduleId: schedule.id },
    })
  ).id;

  tim = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Tim", hourly: true },
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
  kompUttag = byName("Uttagen komp");
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Komptest " } },
  });
});

/** Tio timmars arbete på måndagen, mot åtta planerade. */
async function overtimeMonday() {
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId: anna,
      kind: "ORDER",
      orderId: ordern,
      momentId: svetsning,
      clockInAt: at("07:00"),
      clockOutAt: at("17:00"),
    },
  });
}

async function mondayFor(employeeId: string) {
  const period = await buildPayrollPeriod(
    forCompany(companyId),
    TZ,
    employeeId,
    monday,
    monday
  );
  return period!;
}

describe("godkänd komptid", () => {
  it("flyttar minuterna ur dagens flex och tillbaka när raden tas bort", async () => {
    const db = forCompany(companyId);
    await overtimeMonday();

    // Utan beslut är övertiden flex.
    expect((await mondayFor(anna)).totals.flex).toBe(120);

    await addCompEarned(db, companyId, {
      employeeId: anna,
      date: monday,
      minutes: 120,
      note: "Leverans till Volvo",
      byEmail: "chef@komptest.se",
    });

    const approved = await mondayFor(anna);
    expect(approved.totals.flex).toBe(0);
    expect(approved.comp.earned).toBe(120);
    expect(approved.comp.closing).toBe(120);

    // Raden står på dagen, med id att ta bort den med.
    const [row] = approved.days[0].comp;
    expect(row).toMatchObject({
      minutes: 120,
      note: "Leverans till Volvo",
      absenceId: null,
    });

    await removeCompAdjustment(db, row.id, "chef@komptest.se");

    const removed = await mondayFor(anna);
    expect(removed.totals.flex).toBe(120);
    expect(removed.comp.closing).toBe(0);
    expect(removed.days[0].comp).toEqual([]);
  });

  it("avvisas för en timanställd, och ingen rad skrivs", async () => {
    const db = forCompany(companyId);

    await expect(
      addCompEarned(db, companyId, {
        employeeId: tim,
        date: monday,
        minutes: 120,
        byEmail: "chef@komptest.se",
      })
    ).rejects.toThrow(AbsenceError);

    expect(
      await db.compAdjustment.findMany({ where: { employeeId: tim } })
    ).toEqual([]);
  });

  it("noll timmar avvisas", async () => {
    await expect(
      addCompEarned(forCompany(companyId), companyId, {
        employeeId: anna,
        date: monday,
        minutes: 0,
        byEmail: "chef@komptest.se",
      })
    ).rejects.toThrow(AbsenceError);
  });

  it("loggas både när den skrivs och när den tas bort", async () => {
    const db = forCompany(companyId);

    await addCompEarned(db, companyId, {
      employeeId: anna,
      date: monday,
      minutes: 90,
      byEmail: "chef@komptest.se",
    });

    const row = await db.compAdjustment.findFirstOrThrow({
      where: { employeeId: anna },
    });
    await removeCompAdjustment(db, row.id, "lon@komptest.se");

    const events = await db.auditEvent.findMany({
      where: { entity: "CompAdjustment", entityId: row.id },
      orderBy: { createdAt: "asc" },
    });

    expect(events.map((event) => event.action)).toEqual(["create", "delete"]);
    expect(events.map((event) => event.actorEmail)).toEqual([
      "chef@komptest.se",
      "lon@komptest.se",
    ]);
    for (const event of events) expect(event.subjectEmployeeId).toBe(anna);
    expect((events[1].before as Record<string, unknown>).minutes).toBe(90);
  });
});

describe("uttag genom en frånvaroorsak", () => {
  it("en orsak som drar på komptid tar hela den schemalagda dagen ur saldot", async () => {
    const db = forCompany(companyId);

    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: monday,
      reasonId: kompUttag,
      byEmail: "chef@komptest.se",
    });

    const period = await mondayFor(anna);
    const absence = period.days[0].absences[0];

    // Frånvaron täcker dagen, och uttaget är lika stort som den.
    expect(period.totals.flex).toBe(0);
    expect(period.comp.taken).toBe(480);
    expect(period.comp.closing).toBe(-480);

    // Uttaget pekar på sin frånvaro. Det är så tidrapporten vet att det inte
    // ska ha en egen ta bort-knapp.
    expect(period.days[0].comp).toEqual([
      expect.objectContaining({ minutes: -480, absenceId: absence.id }),
    ]);
  });

  it("en orsak som inte drar på komptid skriver ingen rad i komptidsboken", async () => {
    const db = forCompany(companyId);

    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: monday,
      reasonId: sjuk,
      byEmail: "chef@komptest.se",
    });

    expect(
      await db.compAdjustment.findMany({ where: { employeeId: anna } })
    ).toEqual([]);
    expect((await mondayFor(anna)).comp.closing).toBe(0);
  });

  it("uttaget går inte att ta bort för sig, bara med frånvaron", async () => {
    const db = forCompany(companyId);

    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: monday,
      reasonId: kompUttag,
      minutes: 240,
      byEmail: "chef@komptest.se",
    });

    const withdrawal = await db.compAdjustment.findFirstOrThrow({
      where: { employeeId: anna },
    });

    // Togs uttaget bort ensamt stod frånvaron kvar och täckte dagen, medan
    // komptiden aldrig minskade: samma ledighet hade varit gratis.
    await removeCompAdjustment(db, withdrawal.id, "chef@komptest.se");
    expect(
      await db.compAdjustment.findMany({ where: { employeeId: anna } })
    ).toHaveLength(1);

    const absence = await db.absence.findFirstOrThrow({
      where: { employeeId: anna },
    });
    await removeAbsence(db, absence.id, "chef@komptest.se");

    expect(
      await db.compAdjustment.findMany({ where: { employeeId: anna } })
    ).toEqual([]);
    expect(await db.absence.findMany({ where: { employeeId: anna } })).toEqual(
      []
    );

    const deleted = await db.auditEvent.findMany({
      where: { entity: "Absence", entityId: absence.id, action: "delete" },
    });
    expect(deleted).toHaveLength(1);
  });
});

describe("en annan kunds rader", () => {
  it("går varken att ta bort eller skriva komptid på", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: `Komptest grannen ${Math.random()}`, timezone: TZ },
    });
    const bertil = await unsafeGlobalPrisma.employee.create({
      data: { companyId: other.id, name: "Bertil" },
    });
    const reason = await unsafeGlobalPrisma.absenceReason.create({
      data: { companyId: other.id, name: "Sjuk" },
    });

    const theirAbsence = await unsafeGlobalPrisma.absence.create({
      data: {
        companyId: other.id,
        employeeId: bertil.id,
        date: monday,
        reasonId: reason.id,
        createdByEmail: "chef@grannen.se",
      },
    });
    const theirComp = await unsafeGlobalPrisma.compAdjustment.create({
      data: {
        companyId: other.id,
        employeeId: bertil.id,
        date: monday,
        minutes: 60,
        createdByEmail: "chef@grannen.se",
      },
    });

    const db = forCompany(companyId);

    await removeAbsence(db, theirAbsence.id, "chef@komptest.se");
    await removeCompAdjustment(db, theirComp.id, "chef@komptest.se");

    expect(
      await unsafeGlobalPrisma.absence.findUnique({
        where: { id: theirAbsence.id },
      })
    ).not.toBeNull();
    expect(
      await unsafeGlobalPrisma.compAdjustment.findUnique({
        where: { id: theirComp.id },
      })
    ).not.toBeNull();

    await expect(
      addCompEarned(db, companyId, {
        employeeId: bertil.id,
        date: monday,
        minutes: 60,
        byEmail: "chef@komptest.se",
      })
    ).rejects.toThrow(AbsenceError);

    expect(
      await unsafeGlobalPrisma.compAdjustment.count({
        where: { employeeId: bertil.id },
      })
    ).toBe(1);
  });
});
