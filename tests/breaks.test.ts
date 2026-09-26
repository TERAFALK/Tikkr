import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { clockIn, getOpenEntries } from "@/lib/clock";
import {
  startBreak,
  endBreak,
  getOpenBreak,
  autoCloseForgottenBreaks,
} from "@/lib/breaks";
import { markAbsence, removeAbsence, ABSENCE_LABELS } from "@/lib/absence";
import { buildPayrollPeriod } from "@/lib/payroll";

/**
 * Raster och frånvaro.
 *
 * Den avgörande regeln: ETT RASTTRYCK STÄNGER ALLA PÅGÅENDE JOBB. Det är den
 * som gör att rasten faller bort ur närvarotiden av sig själv, utan att
 * rapporterna eller fakturaunderlaget behöver veta att raster finns.
 */

const TZ = "Europe/Stockholm";

let companyId: string;
let anna: string;
let lunch: string;
let frukost: string;
let order: string;
let svetsning: string;
let fräsning: string;

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Rasttest ${unique}`, timezone: TZ, autoCloseAt: "18:00" },
  });
  companyId = company.id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna" },
    })
  ).id;

  lunch = (
    await unsafeGlobalPrisma.breakType.create({
      data: { companyId, name: "Lunch", sortOrder: 2 },
    })
  ).id;
  frukost = (
    await unsafeGlobalPrisma.breakType.create({
      data: { companyId, name: "Frukost", sortOrder: 1 },
    })
  ).id;

  order = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2601" },
    })
  ).id;
  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    })
  ).id;
  fräsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Fräsning" },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Rasttest " } },
  });
});

const at = (time: string) => new Date(`2026-09-21T${time}:00Z`);

describe("ett rasttryck stänger alla jobb", () => {
  it("stänger både huvudjobbet och sidojobbet", async () => {
    const db = forCompany(companyId);

    await clockIn(companyId, {
      employeeId: anna,
      kind: "ORDER",
      orderId: order,
      momentId: svetsning,
      at: at("06:30"),
    });
    await clockIn(companyId, {
      employeeId: anna,
      kind: "ORDER",
      orderId: order,
      momentId: fräsning,
      at: at("07:00"),
    });

    expect(await getOpenEntries(db, anna)).toHaveLength(2);

    const result = await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: lunch,
      at: at("12:00"),
    });

    expect(result.closedJobs).toBe(2);
    expect(await getOpenEntries(db, anna)).toHaveLength(0);
    expect(result.started.endedAt).toBeNull();
  });

  it("att stämpla in igen avslutar rasten", async () => {
    const db = forCompany(companyId);

    await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: lunch,
      at: at("12:00"),
    });

    await clockIn(companyId, {
      employeeId: anna,
      kind: "ORDER",
      orderId: order,
      momentId: svetsning,
      at: at("12:40"),
    });

    expect(await getOpenBreak(db, anna)).toBeNull();

    const taken = await db.breakEntry.findFirst({ where: { employeeId: anna } });
    expect(taken!.endedAt?.toISOString()).toBe(at("12:40").toISOString());
  });

  it("ett andra tryck på samma rast förlänger den i stället för att starta om", async () => {
    const first = await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: lunch,
      at: at("12:00"),
    });

    const second = await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: lunch,
      at: at("12:02"),
    });

    expect(second.wasDuplicate).toBe(true);
    expect(second.started.id).toBe(first.started.id);
    expect(second.started.startedAt.toISOString()).toBe(at("12:00").toISOString());
  });

  it("samma tryck ur offline-kön registreras en gång", async () => {
    const a = await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: lunch,
      at: at("12:00"),
      clientPunchId: "kö-1",
    });
    const b = await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: lunch,
      at: at("12:00"),
      clientPunchId: "kö-1",
    });

    expect(b.wasDuplicate).toBe(true);
    expect(b.started.id).toBe(a.started.id);

    const all = await forCompany(companyId).breakEntry.findMany({});
    expect(all).toHaveLength(1);
  });
});

describe("rasttiden räknas bort från närvaron", () => {
  it("en timmes lunch ger en timme mindre arbetad tid", async () => {
    const db = forCompany(companyId);

    await clockIn(companyId, {
      employeeId: anna,
      kind: "ORDER",
      orderId: order,
      momentId: svetsning,
      at: at("08:00"),
    });
    await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: lunch,
      at: at("12:00"),
    });
    await clockIn(companyId, {
      employeeId: anna,
      kind: "ORDER",
      orderId: order,
      momentId: svetsning,
      at: at("13:00"),
    });
    await db.timeEntry.updateMany({
      where: { employeeId: anna, clockOutAt: null },
      data: { clockOutAt: at("17:00") },
    });

    const period = await buildPayrollPeriod(
      db,
      TZ,
      anna,
      new Date("2026-09-20T22:00:00Z"),
      new Date("2026-09-20T22:00:00Z")
    );

    // 08–12 och 13–17 = åtta timmar arbete, en timmes rast däremellan.
    expect(period!.totals.worked).toBe(8 * 60);
    expect(period!.totals.breaks).toBe(60);
  });
});

describe("glömd rast", () => {
  it("stängs vid företagets klockslag och flaggas för granskning", async () => {
    await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: frukost,
      at: at("09:00"),
    });

    const closed = await autoCloseForgottenBreaks(
      companyId,
      new Date("2026-09-22T06:00:00Z")
    );

    expect(closed).toHaveLength(1);
    expect(closed[0].needsReview).toBe(true);
    expect(closed[0].source).toBe("AUTO_CLOSE");
    expect(closed[0].endedAt).not.toBeNull();
  });

  it("en pågående rast före klockslaget lämnas i fred", async () => {
    await startBreak(companyId, {
      employeeId: anna,
      breakTypeId: frukost,
      at: at("09:00"),
    });

    const closed = await autoCloseForgottenBreaks(companyId, at("09:30"));

    expect(closed).toHaveLength(0);
  });
});

describe("frånvaro", () => {
  it("samma dag och typ två gånger är en rättelse, inte två poster", async () => {
    const db = forCompany(companyId);
    const day = new Date("2026-09-20T22:00:00Z");

    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: day,
      type: "SJUK",
      byEmail: "admin@test.se",
    });
    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: day,
      type: "SJUK",
      minutes: 240,
      byEmail: "admin@test.se",
    });

    const all = await db.absence.findMany({ where: { employeeId: anna } });
    expect(all).toHaveLength(1);
    expect(all[0].minutes).toBe(240);
  });

  it("två olika typer samma dag är tillåtet", async () => {
    const db = forCompany(companyId);
    const day = new Date("2026-09-20T22:00:00Z");

    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: day,
      type: "SEMESTER",
      minutes: 240,
      byEmail: "admin@test.se",
    });
    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: day,
      type: "VAB",
      minutes: 270,
      byEmail: "admin@test.se",
    });

    expect(await db.absence.findMany({ where: { employeeId: anna } })).toHaveLength(2);
  });

  it("uttagen komp skriver en rad i komptidsboken och städar bort den igen", async () => {
    const db = forCompany(companyId);
    const day = new Date("2026-09-20T22:00:00Z");

    await markAbsence(db, companyId, TZ, {
      employeeId: anna,
      date: day,
      type: "KOMP_UTTAG",
      minutes: 480,
      byEmail: "admin@test.se",
    });

    const comp = await db.compAdjustment.findMany({ where: { employeeId: anna } });
    expect(comp).toHaveLength(1);
    expect(comp[0].minutes).toBe(-480);

    const absence = await db.absence.findFirst({ where: { employeeId: anna } });
    await removeAbsence(db, absence!.id);

    expect(await db.compAdjustment.findMany({ where: { employeeId: anna } })).toEqual([]);
    expect(await db.absence.findMany({ where: { employeeId: anna } })).toEqual([]);
  });

  it("varje frånvarotyp har en svensk etikett", () => {
    for (const label of Object.values(ABSENCE_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("multi-tenant", () => {
  it("en annan kunds rast syns inte", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Rasttest grannen", timezone: TZ },
    });
    const theirEmployee = await unsafeGlobalPrisma.employee.create({
      data: { companyId: other.id, name: "Deras" },
    });
    const theirBreak = await unsafeGlobalPrisma.breakType.create({
      data: { companyId: other.id, name: "Lunch" },
    });
    await unsafeGlobalPrisma.breakEntry.create({
      data: {
        companyId: other.id,
        employeeId: theirEmployee.id,
        breakTypeId: theirBreak.id,
        startedAt: at("12:00"),
      },
    });

    expect(await forCompany(companyId).breakEntry.findMany({})).toEqual([]);

    await unsafeGlobalPrisma.company.delete({ where: { id: other.id } });
  });

  it("en rast kan inte startas på en annan kunds rasttyp", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Rasttest grannen 2", timezone: TZ },
    });
    const theirBreak = await unsafeGlobalPrisma.breakType.create({
      data: { companyId: other.id, name: "Lunch" },
    });

    await expect(
      startBreak(companyId, {
        employeeId: anna,
        breakTypeId: theirBreak.id,
        at: at("12:00"),
      })
    ).rejects.toThrow(/Okänd rast/);

    await unsafeGlobalPrisma.company.delete({ where: { id: other.id } });
  });
});
