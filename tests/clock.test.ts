import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  clockIn,
  clockOut,
  getOpenEntry,
  autoCloseForgottenEntries,
  createManualEntry,
  updateEntryManually,
  ClockError,
} from "@/lib/clock";

/**
 * Stämplingslogiken.
 *
 * Den viktigaste regeln: en anställd kan bara ha ETT pågående jobb. Två öppna
 * stämplingar skulle fakturera samma timme till två kunder.
 */

let companyId: string;
let anna: string;
let inaktivPelle: string;
let orderA: string;
let orderB: string;
let stangdOrder: string;
let svetsning: string;
let montering: string;

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: {
      name: "Stämpeltest AB",
      autoCloseAt: "18:00",
      timezone: "Europe/Stockholm",
    },
  });
  companyId = company.id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson" },
    })
  ).id;
  inaktivPelle = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Pelle Persson", active: false },
    })
  ).id;

  orderA = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "5001", customerName: "Kund A" },
    })
  ).id;
  orderB = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "5002", customerName: "Kund B" },
    })
  ).id;
  stangdOrder = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "5003", status: "CLOSED" },
    })
  ).id;

  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    })
  ).id;
  montering = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Montering" },
    })
  ).id;
});

beforeEach(async () => {
  // Varje test börjar utan stämplingar.
  await unsafeGlobalPrisma.timeEntry.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.$disconnect();
});

describe("stämpla in", () => {
  it("skapar en pågående stämpling", async () => {
    const { started, autoClosed } = await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    expect(started.clockOutAt).toBeNull();
    expect(started.orderId).toBe(orderA);
    expect(started.source).toBe("KIOSK");
    expect(autoClosed).toBeNull();
  });

  it("sparar kiosk och IP för audit-loggen", async () => {
    const { started } = await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      sourceIp: "192.168.1.42",
    });

    expect(started.sourceIp).toBe("192.168.1.42");
  });
});

describe("automatisk utstämpling vid byte av jobb", () => {
  it("stänger det förra jobbet i samma ögonblick som det nya börjar", async () => {
    const morgon = new Date("2026-08-05T06:00:00Z");
    const lunch = new Date("2026-08-05T10:00:00Z");

    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: morgon,
    });

    const { started, autoClosed } = await clockIn(companyId, {
      employeeId: anna,
      orderId: orderB,
      momentId: montering,
      at: lunch,
    });

    expect(autoClosed).not.toBeNull();
    expect(autoClosed!.orderId).toBe(orderA);
    expect(autoClosed!.clockOutAt?.toISOString()).toBe(lunch.toISOString());
    // Jobbyte är ingen systemgissning — personen stämplade själv. Posten
    // behåller sitt ursprung och flaggas inte för granskning.
    expect(autoClosed!.source).toBe("KIOSK");
    expect(autoClosed!.needsReview).toBe(false);

    // Ingen lucka och ingen överlappning: det ena slutar när det andra börjar.
    expect(started.clockInAt.toISOString()).toBe(
      autoClosed!.clockOutAt!.toISOString()
    );
  });

  it("lämnar aldrig två öppna stämplingar", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
    });
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderB,
      momentId: montering,
    });
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: montering,
    });

    const oppna = await unsafeGlobalPrisma.timeEntry.count({
      where: { companyId, employeeId: anna, clockOutAt: null },
    });

    expect(oppna).toBe(1);
  });

  it("rör inte andra anställdas pågående jobb", async () => {
    const bosse = await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Bosse Bok" },
    });

    await clockIn(companyId, {
      employeeId: bosse.id,
      orderId: orderA,
      momentId: svetsning,
    });
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderB,
      momentId: montering,
    });

    const bossesJobb = await getOpenEntry(forCompany(companyId), bosse.id);
    expect(bossesJobb).not.toBeNull();
    expect(bossesJobb!.clockOutAt).toBeNull();

    await unsafeGlobalPrisma.employee.delete({ where: { id: bosse.id } });
  });
});

describe("stämpla ut", () => {
  it("stänger pågående jobb", async () => {
    const start = new Date("2026-08-05T06:00:00Z");
    const slut = new Date("2026-08-05T14:00:00Z");

    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: start,
    });

    const closed = await clockOut(companyId, { employeeId: anna, at: slut });

    expect(closed?.clockOutAt?.toISOString()).toBe(slut.toISOString());
    expect(await getOpenEntry(forCompany(companyId), anna)).toBeNull();
  });

  it("gör ingenting om personen inte är instämplad", async () => {
    expect(await clockOut(companyId, { employeeId: anna })).toBeNull();
  });

  it("dubbeltryck på utstämpling ger inget fel", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
    });

    await clockOut(companyId, { employeeId: anna });
    await expect(clockOut(companyId, { employeeId: anna })).resolves.toBeNull();
  });
});

describe("offline-kön skapar inga dubbletter", () => {
  it("samma tryck skickat två gånger registreras en gång", async () => {
    const punch = {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      clientPunchId: "punch-abc-123",
      fromOfflineQueue: true,
    };

    const first = await clockIn(companyId, punch);
    const second = await clockIn(companyId, punch);

    expect(first.wasDuplicate).toBe(false);
    expect(second.wasDuplicate).toBe(true);
    expect(second.started.id).toBe(first.started.id);

    const antal = await unsafeGlobalPrisma.timeEntry.count({
      where: { companyId, employeeId: anna },
    });
    expect(antal).toBe(1);
  });

  it("stämplingar från kön märks ut i audit-loggen", async () => {
    const { started } = await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      fromOfflineQueue: true,
    });

    expect(started.source).toBe("KIOSK_OFFLINE_SYNC");
  });

  it("en stämpling som ligger före pågående jobb avvisas", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T10:00:00Z"),
    });

    await expect(
      clockIn(companyId, {
        employeeId: anna,
        orderId: orderB,
        momentId: montering,
        at: new Date("2026-08-05T08:00:00Z"),
      })
    ).rejects.toThrow(ClockError);
  });
});

describe("ogiltiga stämplingar avvisas", () => {
  it("okänd anställd", async () => {
    await expect(
      clockIn(companyId, {
        employeeId: "finns-inte",
        orderId: orderA,
        momentId: svetsning,
      })
    ).rejects.toThrow(ClockError);
  });

  it("inaktiv anställd", async () => {
    await expect(
      clockIn(companyId, {
        employeeId: inaktivPelle,
        orderId: orderA,
        momentId: svetsning,
      })
    ).rejects.toThrow(ClockError);
  });

  it("stängd order", async () => {
    await expect(
      clockIn(companyId, {
        employeeId: anna,
        orderId: stangdOrder,
        momentId: svetsning,
      })
    ).rejects.toThrow(ClockError);
  });

  it("okänt moment", async () => {
    await expect(
      clockIn(companyId, {
        employeeId: anna,
        orderId: orderA,
        momentId: "finns-inte",
      })
    ).rejects.toThrow(ClockError);
  });
});

describe("admin lägger in en stämpling för hand", () => {
  const manual = (from: string, to: string, overrides = {}) => ({
    employeeId: anna,
    orderId: orderA,
    momentId: svetsning,
    clockInAt: new Date(from),
    clockOutAt: new Date(to),
    byEmail: "admin@demo.se",
    ...overrides,
  });

  it("skapar posten och märker den som manuell", async () => {
    const entry = await createManualEntry(
      companyId,
      manual("2026-08-05T06:00:00Z", "2026-08-05T14:00:00Z")
    );

    expect(entry.source).toBe("ADMIN_MANUAL");
    expect(entry.needsReview).toBe(false);
    expect(entry.reviewNote).toContain("admin@demo.se");
    expect(entry.clockOutAt?.toISOString()).toBe("2026-08-05T14:00:00.000Z");
  });

  it("vägrar sluttid före starttid", async () => {
    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T14:00:00Z", "2026-08-05T06:00:00Z")
      )
    ).rejects.toThrow(ClockError);
  });

  it("vägrar stämplingar längre än ett dygn", async () => {
    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T06:00:00Z", "2026-08-07T06:00:00Z")
      )
    ).rejects.toThrow(ClockError);
  });

  it("tillåter stängd order — tiden lades ner innan den stängdes", async () => {
    const entry = await createManualEntry(
      companyId,
      manual("2026-08-05T06:00:00Z", "2026-08-05T08:00:00Z", {
        orderId: stangdOrder,
      })
    );

    expect(entry.orderId).toBe(stangdOrder);
  });

  it("tillåter avaktiverad anställd — personen kan ha slutat sedan dess", async () => {
    const entry = await createManualEntry(
      companyId,
      manual("2026-08-05T06:00:00Z", "2026-08-05T08:00:00Z", {
        employeeId: inaktivPelle,
      })
    );

    expect(entry.employeeId).toBe(inaktivPelle);
  });
});

describe("överlappande tider avvisas", () => {
  const manual = (from: string, to: string) => ({
    employeeId: anna,
    orderId: orderA,
    momentId: svetsning,
    clockInAt: new Date(from),
    clockOutAt: new Date(to),
    byEmail: "admin@demo.se",
  });

  beforeEach(async () => {
    // Ett befintligt pass 08–12 svensk tid att krocka med.
    await createManualEntry(
      companyId,
      manual("2026-08-05T06:00:00Z", "2026-08-05T10:00:00Z")
    );
  });

  it("helt inuti det befintliga passet", async () => {
    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T07:00:00Z", "2026-08-05T09:00:00Z")
      )
    ).rejects.toThrow(ClockError);
  });

  it("överlappar i början", async () => {
    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T05:00:00Z", "2026-08-05T07:00:00Z")
      )
    ).rejects.toThrow(ClockError);
  });

  it("överlappar i slutet", async () => {
    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T09:00:00Z", "2026-08-05T11:00:00Z")
      )
    ).rejects.toThrow(ClockError);
  });

  it("omsluter det befintliga passet helt", async () => {
    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T05:00:00Z", "2026-08-05T12:00:00Z")
      )
    ).rejects.toThrow(ClockError);
  });

  it("kant i kant är TILLÅTET — ett pass slutar när nästa börjar", async () => {
    const entry = await createManualEntry(
      companyId,
      manual("2026-08-05T10:00:00Z", "2026-08-05T12:00:00Z")
    );

    expect(entry.id).toBeTruthy();
  });

  it("krock med ett pågående jobb avvisas", async () => {
    await unsafeGlobalPrisma.timeEntry.deleteMany({ where: { companyId } });
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T07:00:00Z", "2026-08-05T09:00:00Z")
      )
    ).rejects.toThrow(ClockError);
  });

  it("en annan anställd på samma tid går bra", async () => {
    const bosse = await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Bosse Bok" },
    });

    const entry = await createManualEntry(companyId, {
      ...manual("2026-08-05T07:00:00Z", "2026-08-05T09:00:00Z"),
      employeeId: bosse.id,
    });

    expect(entry.employeeId).toBe(bosse.id);
    await unsafeGlobalPrisma.employee.delete({ where: { id: bosse.id } });
  });

  it("ändring av en post krockar inte med sig själv", async () => {
    const existing = await unsafeGlobalPrisma.timeEntry.findFirstOrThrow({
      where: { companyId },
    });

    const updated = await updateEntryManually(companyId, existing.id, {
      ...manual("2026-08-05T06:00:00Z", "2026-08-05T11:00:00Z"),
    });

    expect(updated.clockOutAt?.toISOString()).toBe("2026-08-05T11:00:00.000Z");
    expect(updated.source).toBe("ADMIN_MANUAL");
  });
});

describe("glömd utstämpling stängs vid klockslaget och flaggas", () => {
  it("stänger gårdagens öppna stämpling på 18:00 lokal tid", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      // 08:00 svensk tid
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const closed = await autoCloseForgottenEntries(
      companyId,
      new Date("2026-08-06T05:00:00Z")
    );

    expect(closed).toHaveLength(1);
    // 18:00 svensk sommartid = 16:00 UTC
    expect(closed[0].clockOutAt?.toISOString()).toBe("2026-08-05T16:00:00.000Z");
    expect(closed[0].source).toBe("AUTO_CLOSE");
    expect(closed[0].needsReview).toBe(true);
    expect(closed[0].reviewNote).toContain("18:00");
  });

  it("stänger inte i förtid — kvällsskift får jobba vidare", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      // 20:00 svensk tid, alltså efter dagens 18:00
      at: new Date("2026-08-05T18:00:00Z"),
    });

    const closed = await autoCloseForgottenEntries(
      companyId,
      // 22:00 samma kväll
      new Date("2026-08-05T20:00:00Z")
    );

    expect(closed).toHaveLength(0);
    expect(await getOpenEntry(forCompany(companyId), anna)).not.toBeNull();
  });

  it("kvällsskiftet stängs först nästa dags klockslag", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T18:00:00Z"),
    });

    const closed = await autoCloseForgottenEntries(
      companyId,
      new Date("2026-08-06T17:00:00Z")
    );

    expect(closed).toHaveLength(1);
    expect(closed[0].clockOutAt?.toISOString()).toBe("2026-08-06T16:00:00.000Z");
  });

  it("rör inte redan avslutade stämplingar", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });
    await clockOut(companyId, {
      employeeId: anna,
      at: new Date("2026-08-05T12:00:00Z"),
    });

    const closed = await autoCloseForgottenEntries(
      companyId,
      new Date("2026-08-07T05:00:00Z")
    );

    expect(closed).toHaveLength(0);

    const entry = await unsafeGlobalPrisma.timeEntry.findFirst({
      where: { companyId, employeeId: anna },
    });
    expect(entry?.needsReview).toBe(false);
    expect(entry?.clockOutAt?.toISOString()).toBe("2026-08-05T12:00:00.000Z");
  });
});
