import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  ClockError,
  createManualEntries,
  createManualEntry,
  deleteEntryManually,
} from "@/lib/clock";

/**
 * STÄMPLINGAR FÖR HAND — IMPRODUKTIV TID OCH BORTTAGNING (2026-10-13).
 *
 * Två ändringar på kundens begäran:
 *
 *   - Improduktiv tid går att lägga in för hand, inte bara ordertid.
 *   - En avslutad stämpling går att ta bort igen. Den togs bort 2026-09-29
 *     med skälet att en raderad post lämnar ett hål ingen kan förklara; nu
 *     skrivs hela posten i ändringsloggen, och det är vad testen spikar fast.
 */

let companyId: string;
let otherCompanyId: string;
let anna: string;
let ordern: string;
let svetsning: string;
let stadning: string;

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  companyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Manuelltest ${unique}` },
    })
  ).id;
  otherCompanyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Manuelltest grannen ${unique}` },
    })
  ).id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna", costRateOre: 35000 },
    })
  ).id;
  ordern = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7001" },
    })
  ).id;
  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning", costRateOre: 50000 },
    })
  ).id;
  stadning = (
    await unsafeGlobalPrisma.indirectMoment.create({
      data: { companyId, name: "Städning" },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Manuelltest " } },
  });
});

const finished = () => ({
  kind: "ORDER" as const,
  employeeId: anna,
  orderId: ordern,
  momentId: svetsning,
  clockInAt: new Date("2026-09-01T06:00:00Z"),
  clockOutAt: new Date("2026-09-01T14:00:00Z"),
  byEmail: "chef@manuelltest.se",
});

describe("improduktiv tid för hand", () => {
  it("läggs in utan order och arbetsmoment, märkt som manuell", async () => {
    const entry = await createManualEntry(companyId, {
      kind: "INDIRECT",
      indirectMomentId: stadning,
      employeeId: anna,
      clockInAt: new Date("2026-09-02T06:00:00Z"),
      clockOutAt: new Date("2026-09-02T07:00:00Z"),
      byEmail: "chef@manuelltest.se",
    });

    expect(entry.kind).toBe("INDIRECT");
    expect(entry.indirectMomentId).toBe(stadning);
    expect(entry.orderId).toBeNull();
    expect(entry.momentId).toBeNull();
    expect(entry.source).toBe("ADMIN_MANUAL");
  });
});

/**
 * DUBBELJOBB I ETT STEG (2026-11-23). Ny stämpling lägger in ett jobb och de
 * som löpte samtidigt, som Lägg till jobb på stämplingsskärmen. Allt eller
 * inget.
 */
describe("samtidiga stämplingar för hand", () => {
  const frasning = async () =>
    (
      await unsafeGlobalPrisma.workMoment.create({
        data: { companyId, name: "Fräsning", costRateOre: 60000 },
      })
    ).id;

  it("lägger in ett dubbeljobb med egna tider", async () => {
    const fras = await frasning();

    const created = await createManualEntries(companyId, [
      finished(),
      {
        ...finished(),
        momentId: fras,
        clockInAt: new Date("2026-09-01T08:00:00Z"),
        clockOutAt: new Date("2026-09-01T16:00:00Z"),
      },
    ]);

    expect(created).toHaveLength(2);
    expect(created.every((entry) => entry.source === "ADMIN_MANUAL")).toBe(true);
    expect(
      await forCompany(companyId).auditEvent.count({
        where: { entity: "TimeEntry", action: "create" },
      })
    ).toBe(2);
  });

  it("två på samma arbetsmoment samtidigt sparar ingenting", async () => {
    await expect(
      createManualEntries(companyId, [
        finished(),
        {
          ...finished(),
          clockInAt: new Date("2026-09-01T08:00:00Z"),
          clockOutAt: new Date("2026-09-01T16:00:00Z"),
        },
      ])
    ).rejects.toBeInstanceOf(ClockError);

    expect(await forCompany(companyId).timeEntry.count()).toBe(0);
  });

  it("ordertid och improduktiv tid samtidigt, åt båda hållen", async () => {
    const stadningen = {
      kind: "INDIRECT" as const,
      indirectMomentId: stadning,
      employeeId: anna,
      clockInAt: new Date("2026-09-01T08:00:00Z"),
      clockOutAt: new Date("2026-09-01T09:00:00Z"),
      byEmail: "chef@manuelltest.se",
    };

    const created = await createManualEntries(companyId, [finished(), stadningen]);

    expect(created.map((entry) => entry.kind)).toEqual(["ORDER", "INDIRECT"]);
    expect(created[1].indirectMomentId).toBe(stadning);
    expect(created[1].orderId).toBeNull();
  });

  it("två pass samtidigt på samma improduktiva moment sparar ingenting", async () => {
    const stadningen = (from: string, to: string) => ({
      kind: "INDIRECT" as const,
      indirectMomentId: stadning,
      employeeId: anna,
      clockInAt: new Date(from),
      clockOutAt: new Date(to),
      byEmail: "chef@manuelltest.se",
    });

    await expect(
      createManualEntries(companyId, [
        stadningen("2026-09-01T08:00:00Z", "2026-09-01T10:00:00Z"),
        stadningen("2026-09-01T09:00:00Z", "2026-09-01T11:00:00Z"),
      ])
    ).rejects.toBeInstanceOf(ClockError);

    expect(await forCompany(companyId).timeEntry.count()).toBe(0);
  });

  it("ett jobb som brister sparar inte heller det andra", async () => {
    const fras = await frasning();

    await expect(
      createManualEntries(companyId, [
        finished(),
        {
          ...finished(),
          momentId: fras,
          clockInAt: new Date("2026-09-01T16:00:00Z"),
          clockOutAt: new Date("2026-09-01T08:00:00Z"),
        },
      ])
    ).rejects.toBeInstanceOf(ClockError);

    expect(await forCompany(companyId).timeEntry.count()).toBe(0);
  });
});

describe("ta bort en stämpling", () => {
  it("tar bort posten och skriver hela den i ändringsloggen", async () => {
    const entry = await createManualEntry(companyId, finished());

    await deleteEntryManually(companyId, entry.id, "lon@manuelltest.se");

    expect(
      await unsafeGlobalPrisma.timeEntry.findUnique({ where: { id: entry.id } })
    ).toBeNull();

    const deleted = await forCompany(companyId).auditEvent.findFirstOrThrow({
      where: { entity: "TimeEntry", entityId: entry.id, action: "delete" },
    });

    expect(deleted.actorEmail).toBe("lon@manuelltest.se");
    expect(deleted.subjectEmployeeId).toBe(anna);
    expect(deleted.after).toBeNull();
    expect(deleted.before).toMatchObject({
      employeeId: anna,
      orderId: ordern,
      momentId: svetsning,
      clockInAt: "2026-09-01T06:00:00.000Z",
      clockOutAt: "2026-09-01T14:00:00.000Z",
    });
  });

  it("vägrar ta bort en pågående stämpling", async () => {
    const open = await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: anna,
        kind: "ORDER",
        orderId: ordern,
        momentId: svetsning,
        clockInAt: new Date("2026-09-03T06:00:00Z"),
      },
    });

    await expect(
      deleteEntryManually(companyId, open.id, "chef@manuelltest.se")
    ).rejects.toThrow(ClockError);

    expect(
      await unsafeGlobalPrisma.timeEntry.findUnique({ where: { id: open.id } })
    ).not.toBeNull();
  });

  it("en annan kunds stämpling går inte att ta bort", async () => {
    const entry = await createManualEntry(companyId, finished());

    await expect(
      deleteEntryManually(otherCompanyId, entry.id, "chef@grannen.se")
    ).rejects.toThrow(ClockError);

    expect(
      await unsafeGlobalPrisma.timeEntry.findUnique({ where: { id: entry.id } })
    ).not.toBeNull();
    expect(
      await unsafeGlobalPrisma.auditEvent.count({
        where: { entityId: entry.id, action: "delete" },
      })
    ).toBe(0);
  });
});
