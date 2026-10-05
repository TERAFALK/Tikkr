import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  autoCloseForgottenEntries,
  clockIn,
  createManualEntry,
  updateEntryManually,
} from "@/lib/clock";
import { changedFields, employeeSnapshot } from "@/lib/audit";

/**
 * ÄNDRINGSLOGGEN.
 *
 * Historik går inte att skriva i efterhand. Det testerna skyddar: varje
 * ändring av en stämpling lämnar en rad med värdet FÖRE och EFTER, raden
 * skrivs av den som gjorde ändringen, och loggen bär aldrig ett namn.
 */

let companyId: string;
let otherCompanyId: string;
let anna: string;
let order: string;
let svetsning: string;
let montering: string;

beforeAll(async () => {
  companyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: "Loggtest AB", autoCloseAt: "18:00" },
    })
  ).id;
  otherCompanyId = (
    await unsafeGlobalPrisma.company.create({ data: { name: "Annan AB" } })
  ).id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson", costRateOre: 35000 },
    })
  ).id;
  order = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7001" },
    })
  ).id;
  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning", costRateOre: 50000 },
    })
  ).id;
  montering = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Montering", costRateOre: 20000 },
    })
  ).id;
});

beforeEach(async () => {
  await unsafeGlobalPrisma.auditEvent.deleteMany({ where: { companyId } });
  await unsafeGlobalPrisma.timeEntry.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await unsafeGlobalPrisma.timeEntry.deleteMany({ where: { companyId } });
  await unsafeGlobalPrisma.company.deleteMany({
    where: { id: { in: [companyId, otherCompanyId] } },
  });
});

function manual(overrides: Partial<{ clockInAt: Date; clockOutAt: Date; momentId: string }> = {}) {
  return {
    kind: "ORDER" as const,
    employeeId: anna,
    orderId: order,
    momentId: overrides.momentId ?? svetsning,
    clockInAt: overrides.clockInAt ?? new Date("2026-09-01T06:00:00Z"),
    clockOutAt: overrides.clockOutAt ?? new Date("2026-09-01T14:00:00Z"),
    byEmail: "chef@loggtest.se",
  };
}

describe("en inlagd post loggas", () => {
  it("med vem som lade in den och vad den blev", async () => {
    const entry = await createManualEntry(companyId, manual());

    const events = await forCompany(companyId).auditEvent.findMany({
      where: { entityId: entry.id },
    });

    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("create");
    expect(events[0].actorEmail).toBe("chef@loggtest.se");
    expect(events[0].subjectEmployeeId).toBe(anna);
    expect((events[0].after as Record<string, unknown>).clockOutAt).toBe(
      "2026-09-01T14:00:00.000Z"
    );
  });
});

describe("en ändrad post loggas med värdet före", () => {
  it("före och efter står båda i raden", async () => {
    const entry = await createManualEntry(companyId, manual());

    await updateEntryManually(
      companyId,
      entry.id,
      manual({ clockOutAt: new Date("2026-09-01T15:30:00Z") })
    );

    const update = await forCompany(companyId).auditEvent.findFirstOrThrow({
      where: { entityId: entry.id, action: "update" },
    });

    expect((update.before as Record<string, unknown>).clockOutAt).toBe(
      "2026-09-01T14:00:00.000Z"
    );
    expect((update.after as Record<string, unknown>).clockOutAt).toBe(
      "2026-09-01T15:30:00.000Z"
    );
  });
});

describe("satserna följer arbetet, inte ändringsdagen", () => {
  it("en rättad sluttid behåller satserna från stämplingstillfället", async () => {
    // Förr kopierades dagens satser in vid varje ändring, och en fakturerad
    // post från mars fick oktoberpris för att någon flyttade sluttiden.
    const entry = await createManualEntry(companyId, manual());

    await unsafeGlobalPrisma.workMoment.update({
      where: { id: svetsning },
      data: { costRateOre: 60000 },
    });

    try {
      const updated = await updateEntryManually(
        companyId,
        entry.id,
        manual({ clockOutAt: new Date("2026-09-01T15:00:00Z") })
      );

      expect(updated.momentCostRateOre).toBe(50000);
    } finally {
      await unsafeGlobalPrisma.workMoment.update({
        where: { id: svetsning },
        data: { costRateOre: 50000 },
      });
    }
  });

  it("ett bytt arbetsmoment får det nya momentets sats", async () => {
    const entry = await createManualEntry(companyId, manual());

    const updated = await updateEntryManually(
      companyId,
      entry.id,
      manual({ momentId: montering })
    );

    expect(updated.momentCostRateOre).toBe(20000);
  });
});

describe("systemets egna ändringar", () => {
  it("en automatisk utstämpling loggas som Tikkrs", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: order,
      momentId: svetsning,
      at: new Date("2026-09-02T06:00:00Z"),
    });

    const closed = await autoCloseForgottenEntries(
      companyId,
      new Date("2026-09-03T06:00:00Z")
    );
    expect(closed).toHaveLength(1);

    const event = await forCompany(companyId).auditEvent.findFirstOrThrow({
      where: { entityId: closed[0].id },
    });

    expect(event.actorEmail).toBe("system");
    expect(event.action).toBe("auto-close");
    expect((event.before as Record<string, unknown>).clockOutAt).toBeNull();
  });
});

describe("loggen är företagets egen", () => {
  it("ett annat företag ser den inte", async () => {
    await createManualEntry(companyId, manual());

    expect(
      await forCompany(otherCompanyId).auditEvent.count({})
    ).toBe(0);
  });
});

describe("loggen bär inga namn", () => {
  it("en anställds ögonblicksbild har varken namn, nummer eller foto", () => {
    const snapshot = employeeSnapshot({
      active: true,
      costRateOre: 35000,
      flexOpeningMinutes: 0,
      compOpeningMinutes: 0,
      balanceOpeningDate: null,
    });

    expect(Object.keys(snapshot)).not.toContain("name");
    expect(Object.keys(snapshot)).not.toContain("employeeNumber");
    expect(Object.keys(snapshot)).not.toContain("photoData");
  });

  it("bara de fält som ändrats tas med", () => {
    const diff = changedFields(
      { costRateOre: 35000, active: true },
      { costRateOre: 40000, active: true }
    );

    expect(diff).toEqual({
      before: { costRateOre: 35000 },
      after: { costRateOre: 40000 },
    });
    expect(changedFields({ active: true }, { active: true })).toBeNull();
  });
});
