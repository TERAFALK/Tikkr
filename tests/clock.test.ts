import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  clockIn,
  clockOut,
  getOpenEntries,
  getOpenEntryForMoment,
  clockOutAll,
  autoCloseForgottenEntries,
  createManualEntry,
  updateEntryManually,
  closeOrder,
  openEntriesOnOrder,
  ClockError,
} from "@/lib/clock";

/**
 * Stämplingslogiken.
 *
 * Den viktigaste regeln: en anställd kan bara ha ETT pågående jobb PER
 * ARBETSMOMENT. Två öppna stämplingar på samma maskin skulle fakturera samma
 * timme till två kunder. På olika maskiner är parallell tid däremot riktig —
 * två maskiner som går är två maskintimmar.
 */

let companyId: string;
let anna: string;
let inaktivPelle: string;
let orderA: string;
let orderB: string;
let stangdOrder: string;
let svetsning: string;
let montering: string;
let stadning: string;

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

  stadning = (
    await unsafeGlobalPrisma.indirectMoment.create({
      data: { companyId, name: "Städning" },
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
      kind: "ORDER",
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
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      sourceIp: "192.168.1.42",
    });

    expect(started.sourceIp).toBe("192.168.1.42");
  });
});

describe("automatisk utstämpling vid byte av jobb på samma maskin", () => {
  it("stänger det förra jobbet i samma ögonblick som det nya börjar", async () => {
    const morgon = new Date("2026-08-05T06:00:00Z");
    const lunch = new Date("2026-08-05T10:00:00Z");

    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: morgon,
    });

    // Samma moment, ny order: maskinen byter jobb.
    const { started, autoClosed } = await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderB,
      momentId: svetsning,
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

  it("lämnar aldrig två öppna stämplingar på samma moment", async () => {
    for (const orderId of [orderA, orderB, orderA]) {
      await clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId,
        momentId: svetsning,
      });
    }

    const oppna = await unsafeGlobalPrisma.timeEntry.count({
      where: {
        companyId,
        employeeId: anna,
        momentId: svetsning,
        clockOutAt: null,
      },
    });

    expect(oppna).toBe(1);
  });

  it("rör inte andra anställdas pågående jobb", async () => {
    const bosse = await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Bosse Bok" },
    });

    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: bosse.id,
      orderId: orderA,
      momentId: svetsning,
    });
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderB,
      momentId: svetsning,
    });

    const bossesJobb = await getOpenEntries(forCompany(companyId), bosse.id);
    expect(bossesJobb).toHaveLength(1);
    expect(bossesJobb[0].clockOutAt).toBeNull();

    await unsafeGlobalPrisma.employee.delete({ where: { id: bosse.id } });
  });
});

describe("stämpla ut", () => {
  it("stänger pågående jobb", async () => {
    const start = new Date("2026-08-05T06:00:00Z");
    const slut = new Date("2026-08-05T14:00:00Z");

    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: start,
    });

    const closed = await clockOut(companyId, { employeeId: anna, at: slut });

    expect(closed?.clockOutAt?.toISOString()).toBe(slut.toISOString());
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(0);
  });

  it("gör ingenting om personen inte är instämplad", async () => {
    expect(await clockOut(companyId, { employeeId: anna })).toBeNull();
  });

  it("dubbeltryck på utstämpling ger inget fel", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
    });

    await clockOut(companyId, { employeeId: anna, momentId: svetsning });
    await expect(
      clockOut(companyId, { employeeId: anna, momentId: svetsning })
    ).resolves.toBeNull();
  });
});

describe("offline-kön skapar inga dubbletter", () => {
  it("samma tryck skickat två gånger registreras en gång", async () => {
    const punch = {
      kind: "ORDER" as const,
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
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      fromOfflineQueue: true,
    });

    expect(started.source).toBe("KIOSK_OFFLINE_SYNC");
  });

  it("en stämpling före ett pågående jobb på SAMMA maskin avvisas", async () => {
    // Kön levererar tryck sorterade på tidpunkt. Kommer ett som börjar före
    // det som redan pågår på maskinen har något gått fel i ordningen, och en
    // maskin kan ändå inte köra två jobb samtidigt.
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T10:00:00Z"),
    });

    await expect(
      clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId: orderB,
        momentId: svetsning,
        at: new Date("2026-08-05T08:00:00Z"),
      })
    ).rejects.toThrow(ClockError);
  });

  it("en försenad stämpling på en ANNAN maskin går igenom", async () => {
    // Kontrollen ovan gäller per maskin. Att fräsen startade innan svetsen är
    // inget fel — det är två maskiner, och den som kör båda hann trycka i den
    // ordningen. Att avvisa hade dessutom kostat arbetstid: kön plockar bort
    // ett tryck som avvisas.
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T10:00:00Z"),
    });

    const { started, autoClosed } = await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderB,
      momentId: montering,
      at: new Date("2026-08-05T08:00:00Z"),
    });

    expect(autoClosed).toBeNull();
    expect(started.clockInAt.toISOString()).toBe("2026-08-05T08:00:00.000Z");
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(2);
  });
});

describe("ogiltiga stämplingar avvisas", () => {
  it("okänd anställd", async () => {
    await expect(
      clockIn(companyId, {
        kind: "ORDER",
        employeeId: "finns-inte",
        orderId: orderA,
        momentId: svetsning,
      })
    ).rejects.toThrow(ClockError);
  });

  it("inaktiv anställd", async () => {
    await expect(
      clockIn(companyId, {
        kind: "ORDER",
        employeeId: inaktivPelle,
        orderId: orderA,
        momentId: svetsning,
      })
    ).rejects.toThrow(ClockError);
  });

  it("stängd order", async () => {
    await expect(
      clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId: stangdOrder,
        momentId: svetsning,
      })
    ).rejects.toThrow(ClockError);
  });

  it("okänt moment", async () => {
    await expect(
      clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId: orderA,
        momentId: "finns-inte",
      })
    ).rejects.toThrow(ClockError);
  });
});

describe("admin lägger in en stämpling för hand", () => {
  const manual = (from: string, to: string, overrides = {}) => ({
    kind: "ORDER" as const,
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

describe("överlappande tider på samma arbetsmoment avvisas", () => {
  const manual = (from: string, to: string) => ({
    kind: "ORDER" as const,
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
      kind: "ORDER",
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

  it("överlapp på ETT ANNAT moment är tillåtet", async () => {
    // Två maskiner som går samtidigt. Det är inte dubbelfakturering utan två
    // maskintimmar, och hela skälet till att regeln prövar momentet.
    const entry = await createManualEntry(companyId, {
      ...manual("2026-08-05T07:00:00Z", "2026-08-05T09:00:00Z"),
      orderId: orderB,
      momentId: montering,
    });

    expect(entry.momentId).toBe(montering);
    expect(entry.clockInAt.toISOString()).toBe("2026-08-05T07:00:00.000Z");
  });

  it("krockmeddelandet nämner arbetsmomentet", async () => {
    // Admin ska förstå VILKEN maskin som redan är upptagen, inte bara att
    // något krockar.
    await expect(
      createManualEntry(
        companyId,
        manual("2026-08-05T07:00:00Z", "2026-08-05T09:00:00Z")
      )
    ).rejects.toThrow(/Svetsning/);
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
      kind: "ORDER",
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
      kind: "ORDER",
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
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(1);
  });

  it("kvällsskiftet stängs först nästa dags klockslag", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
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
      kind: "ORDER",
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

describe("avsluta en order med pågående stämplingar", () => {
  let order: string;
  let counter = 0;

  beforeEach(async () => {
    // Egen order per test. closeOrder ändrar status, och en delad order hade
    // gjort testerna beroende av i vilken ordning de råkar köras.
    counter += 1;
    order = (
      await unsafeGlobalPrisma.order.create({
        data: {
          companyId,
          orderNumber: `9${String(counter).padStart(3, "0")}`,
          customerName: "Kund C",
        },
      })
    ).id;
  });

  it("listar dem som står instämplade innan något ändras", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: order,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const blockers = await openEntriesOnOrder(companyId, order);

    expect(blockers).toHaveLength(1);
    expect(blockers[0].employeeName).toBe("Anna Andersson");
    // Momentet måste följa med: samma person kan vara inne på två maskiner
    // på samma order, och då säger namnet ensamt inte vad som ska stängas.
    expect(blockers[0].momentName).toBe("Svetsning");
    expect(blockers[0].clockInAt.toISOString()).toBe("2026-08-05T06:00:00.000Z");

    // Att fråga får inte ändra något.
    const fresh = await unsafeGlobalPrisma.order.findUnique({
      where: { id: order },
    });
    expect(fresh?.status).toBe("OPEN");
  });

  it("ger en tom lista när ingen är instämplad", async () => {
    expect(await openEntriesOnOrder(companyId, order)).toHaveLength(0);
  });

  it("stänger ordern utan att röra någon tid när ingen är inne", async () => {
    const result = await closeOrder(companyId, order, {
      byEmail: "chef@example.com",
    });

    expect(result.clockedOut).toBe(0);

    const fresh = await unsafeGlobalPrisma.order.findUnique({
      where: { id: order },
    });
    expect(fresh?.status).toBe("CLOSED");
  });

  it("stämplar ut dem som står kvar och flaggar tiden för granskning", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: order,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const result = await closeOrder(companyId, order, {
      byEmail: "chef@example.com",
      at: new Date("2026-08-05T14:00:00Z"),
    });

    expect(result.clockedOut).toBe(1);

    const entry = await unsafeGlobalPrisma.timeEntry.findFirst({
      where: { companyId, orderId: order },
    });

    expect(entry?.clockOutAt?.toISOString()).toBe("2026-08-05T14:00:00.000Z");
    expect(entry?.needsReview).toBe(true);
    expect(entry?.reviewNote).toContain("chef@example.com");
    // source beskriver hur posten SKAPADES, inte hur den stängdes.
    expect(entry?.source).toBe("KIOSK");
  });

  it("rör inte pågående stämplingar på andra ordrar", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    await closeOrder(companyId, order, { byEmail: "chef@example.com" });

    const annas = await getOpenEntries(forCompany(companyId), anna);
    expect(annas).toHaveLength(1);
    expect(annas[0].orderId).toBe(orderA);
    expect(annas[0].clockOutAt).toBeNull();
  });

  it("lämnar aldrig en post som slutar före den börjat", async () => {
    // En skärm med fel klocka kan ha stämplat in på en tidpunkt som ligger
    // framåt i tiden. Utstämplingen får då inte hamna före instämplingen.
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: order,
      momentId: svetsning,
      at: new Date("2026-08-05T10:00:00Z"),
    });

    await closeOrder(companyId, order, {
      byEmail: "chef@example.com",
      at: new Date("2026-08-05T08:00:00Z"),
    });

    const entry = await unsafeGlobalPrisma.timeEntry.findFirst({
      where: { companyId, orderId: order },
    });

    expect(entry?.clockOutAt?.toISOString()).toBe("2026-08-05T10:00:00.000Z");
    expect(entry!.clockOutAt!.getTime()).toBeGreaterThanOrEqual(
      entry!.clockInAt.getTime()
    );
  });

  it("en avslutad order går inte att stämpla på igen", async () => {
    await closeOrder(companyId, order, { byEmail: "chef@example.com" });

    await expect(
      clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId: order,
        momentId: svetsning,
      })
    ).rejects.toThrow(ClockError);
  });

  it("vägrar en order som inte finns", async () => {
    await expect(
      closeOrder(companyId, "finns-inte", { byEmail: "chef@example.com" })
    ).rejects.toThrow(ClockError);
  });
});

describe("två maskiner samtidigt", () => {
  it("instämpling på ett annat moment stänger inte det pågående", async () => {
    const { started: svets } = await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const { started: montage, autoClosed } = await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderB,
      momentId: montering,
      at: new Date("2026-08-05T07:00:00Z"),
    });

    expect(autoClosed).toBeNull();

    const oppna = await getOpenEntries(forCompany(companyId), anna);
    expect(oppna).toHaveLength(2);
    expect(oppna.map((entry) => entry.id).sort()).toEqual(
      [svets.id, montage.id].sort()
    );
  });

  it("båda ordrarna får sin egen hela timme", async () => {
    // Två maskiner som går en timme är två maskintimmar. Att dela timmen på
    // hälften hade gett fel maskinkostnad på båda ordrarna.
    for (const [orderId, momentId] of [
      [orderA, svetsning],
      [orderB, montering],
    ]) {
      await clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId,
        momentId,
        at: new Date("2026-08-05T06:00:00Z"),
      });
    }

    await clockOutAll(companyId, {
      employeeId: anna,
      at: new Date("2026-08-05T07:00:00Z"),
    });

    const poster = await unsafeGlobalPrisma.timeEntry.findMany({
      where: { companyId, employeeId: anna },
    });

    expect(poster).toHaveLength(2);
    for (const post of poster) {
      expect(post.clockInAt.toISOString()).toBe("2026-08-05T06:00:00.000Z");
      expect(post.clockOutAt?.toISOString()).toBe("2026-08-05T07:00:00.000Z");
    }
  });

  it("hittar det pågående jobbet på ett bestämt moment", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
    });
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderB,
      momentId: montering,
    });

    const db = forCompany(companyId);

    expect((await getOpenEntryForMoment(db, anna, svetsning))?.orderId).toBe(
      orderA
    );
    expect((await getOpenEntryForMoment(db, anna, montering))?.orderId).toBe(
      orderB
    );
  });

  it("glömd utstämpling stänger båda maskinerna", async () => {
    for (const [orderId, momentId] of [
      [orderA, svetsning],
      [orderB, montering],
    ]) {
      await clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId,
        momentId,
        at: new Date("2026-08-05T06:00:00Z"),
      });
    }

    const closed = await autoCloseForgottenEntries(
      companyId,
      new Date("2026-08-06T05:00:00Z")
    );

    expect(closed).toHaveLength(2);
    for (const post of closed) {
      expect(post.needsReview).toBe(true);
      expect(post.source).toBe("AUTO_CLOSE");
    }
  });
});

describe("utstämpling när två jobb pågår", () => {
  async function tvaJobb() {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderB,
      momentId: montering,
      at: new Date("2026-08-05T07:00:00Z"),
    });
  }

  it("stänger det jobb momentet pekar ut", async () => {
    await tvaJobb();

    const closed = await clockOut(companyId, {
      employeeId: anna,
      momentId: svetsning,
      at: new Date("2026-08-05T09:00:00Z"),
    });

    expect(closed?.orderId).toBe(orderA);

    const kvar = await getOpenEntries(forCompany(companyId), anna);
    expect(kvar).toHaveLength(1);
    expect(kvar[0].orderId).toBe(orderB);
  });

  it("lämnar posten orörd och oflaggad när momentet angetts", async () => {
    await tvaJobb();

    const closed = await clockOut(companyId, {
      employeeId: anna,
      momentId: montering,
      at: new Date("2026-08-05T09:00:00Z"),
    });

    expect(closed?.needsReview).toBe(false);
    expect(closed?.reviewNote).toBeNull();
  });

  it("kastar aldrig fel när momentet saknas — tiden får inte gå förlorad", async () => {
    // Ett fel här ger 409 från API:t, och offline-kön KASTAR ett tryck som
    // får 4xx. Ett tvetydigt anrop får kosta en rad i granskningslistan.
    await tvaJobb();

    await expect(
      clockOut(companyId, {
        employeeId: anna,
        at: new Date("2026-08-05T09:00:00Z"),
      })
    ).resolves.not.toBeNull();
  });

  it("flaggar för granskning när momentet saknas", async () => {
    await tvaJobb();

    const closed = await clockOut(companyId, {
      employeeId: anna,
      at: new Date("2026-08-05T09:00:00Z"),
    });

    // Det senast påbörjade stängs.
    expect(closed?.orderId).toBe(orderB);
    expect(closed?.needsReview).toBe(true);
    expect(closed?.reviewNote).toContain("angav inte vilket jobb");
  });

  it("flaggar inte när bara ett jobb pågår och momentet saknas", async () => {
    // Det vanliga fallet, och det som köade tryck från äldre skärmar bär.
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const closed = await clockOut(companyId, {
      employeeId: anna,
      at: new Date("2026-08-05T09:00:00Z"),
    });

    expect(closed?.needsReview).toBe(false);
  });

  it("stämpla ut allt stänger båda jobben utan att flagga", async () => {
    await tvaJobb();

    const closed = await clockOutAll(companyId, {
      employeeId: anna,
      at: new Date("2026-08-05T09:00:00Z"),
    });

    expect(closed).toHaveLength(2);
    for (const post of closed) {
      expect(post.needsReview).toBe(false);
    }
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(0);
  });

  it("stämpla ut allt gör ingenting när inget pågår", async () => {
    expect(await clockOutAll(companyId, { employeeId: anna })).toHaveLength(0);
  });

  it("utstämpling från ett moment personen inte är inne på gör ingenting", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
    });

    expect(
      await clockOut(companyId, { employeeId: anna, momentId: montering })
    ).toBeNull();
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(1);
  });
});

describe("improduktiv tid", () => {
  it("stämplar in utan order", async () => {
    const { started } = await clockIn(companyId, {
      kind: "INDIRECT",
      employeeId: anna,
      indirectMomentId: stadning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    expect(started.kind).toBe("INDIRECT");
    expect(started.indirectMomentId).toBe(stadning);
    expect(started.orderId).toBeNull();
    expect(started.momentId).toBeNull();
    // Improduktiv tid kalkyleras inte. Varken personens eller maskinens sats
    // kopieras — den tiden når aldrig ett fakturaunderlag.
    expect(started.momentCostRateOre).toBeNull();
    expect(started.employeeCostRateOre).toBeNull();
  });

  it("en orderstämpling har inget improduktivt moment", async () => {
    const { started } = await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
    });

    expect(started.kind).toBe("ORDER");
    expect(started.indirectMomentId).toBeNull();
  });

  it("instämpling på städning stänger inte det pågående orderjobbet", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const { autoClosed } = await clockIn(companyId, {
      kind: "INDIRECT",
      employeeId: anna,
      indirectMomentId: stadning,
      at: new Date("2026-08-05T07:00:00Z"),
    });

    expect(autoClosed).toBeNull();
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(2);
  });

  it("instämpling på samma improduktiva moment stänger det förra", async () => {
    await clockIn(companyId, {
      kind: "INDIRECT",
      employeeId: anna,
      indirectMomentId: stadning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const { autoClosed } = await clockIn(companyId, {
      kind: "INDIRECT",
      employeeId: anna,
      indirectMomentId: stadning,
      at: new Date("2026-08-05T07:00:00Z"),
    });

    expect(autoClosed).not.toBeNull();
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(1);
  });

  it("stämplas ut med sitt improduktiva moment", async () => {
    await clockIn(companyId, {
      kind: "INDIRECT",
      employeeId: anna,
      indirectMomentId: stadning,
      at: new Date("2026-08-05T06:00:00Z"),
    });
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:30:00Z"),
    });

    const closed = await clockOut(companyId, {
      employeeId: anna,
      indirectMomentId: stadning,
      at: new Date("2026-08-05T08:00:00Z"),
    });

    expect(closed?.kind).toBe("INDIRECT");

    const kvar = await getOpenEntries(forCompany(companyId), anna);
    expect(kvar).toHaveLength(1);
    expect(kvar[0].kind).toBe("ORDER");
  });

  it("okänt improduktivt moment avvisas", async () => {
    await expect(
      clockIn(companyId, {
        kind: "INDIRECT",
        employeeId: anna,
        indirectMomentId: "finns-inte",
      })
    ).rejects.toThrow(ClockError);
  });

  it("avaktiverat improduktivt moment avvisas", async () => {
    const vilande = await unsafeGlobalPrisma.indirectMoment.create({
      data: { companyId, name: "Utbildning", active: false },
    });

    await expect(
      clockIn(companyId, {
        kind: "INDIRECT",
        employeeId: anna,
        indirectMomentId: vilande.id,
      })
    ).rejects.toThrow(ClockError);

    await unsafeGlobalPrisma.indirectMoment.delete({ where: { id: vilande.id } });
  });

  it("glömd improduktiv stämpling stängs vid klockslaget och flaggas", async () => {
    await clockIn(companyId, {
      kind: "INDIRECT",
      employeeId: anna,
      indirectMomentId: stadning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const closed = await autoCloseForgottenEntries(
      companyId,
      new Date("2026-08-06T05:00:00Z")
    );

    expect(closed).toHaveLength(1);
    expect(closed[0].needsReview).toBe(true);
  });

  it("syns inte bland dem som blockerar ett orderavslut", async () => {
    await clockIn(companyId, {
      kind: "INDIRECT",
      employeeId: anna,
      indirectMomentId: stadning,
    });

    expect(await openEntriesOnOrder(companyId, orderA)).toHaveLength(0);
  });
});

describe("offline-kön skapar inga dubbletter vid utstämpling", () => {
  it("samma utstämpling skickad två gånger stänger bara en gång", async () => {
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const punch = {
      employeeId: anna,
      momentId: svetsning,
      clientPunchId: "ut-1",
      at: new Date("2026-08-05T12:00:00Z"),
    };

    const first = await clockOut(companyId, punch);
    const second = await clockOut(companyId, punch);

    expect(second?.id).toBe(first?.id);
    expect(second?.clockOutAt?.toISOString()).toBe("2026-08-05T12:00:00.000Z");
  });

  it("en omsänd utstämpling stänger inte ett jobb som startats efteråt", async () => {
    // Felet som fanns: kontrollen letade i clientPunchId, som bär postens
    // INSTÄMPLING, och kunde därför aldrig träffa. Trycket sändes om och
    // stängde eftermiddagens jobb i stället.
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T06:00:00Z"),
    });

    const punch = {
      employeeId: anna,
      momentId: svetsning,
      clientPunchId: "ut-2",
      at: new Date("2026-08-05T10:00:00Z"),
    };

    await clockOut(companyId, punch);

    // Samma maskin, nytt jobb efter lunch.
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderB,
      momentId: svetsning,
      at: new Date("2026-08-05T11:00:00Z"),
    });

    await clockOut(companyId, punch);

    const eftermiddagen = await getOpenEntryForMoment(
      forCompany(companyId),
      anna,
      svetsning
    );

    expect(eftermiddagen).not.toBeNull();
    expect(eftermiddagen?.orderId).toBe(orderB);
    expect(eftermiddagen?.clockOutAt).toBeNull();
  });

  it("en utstämpling som ligger före det pågående jobbet rör ingenting", async () => {
    // Ett gammalt tryck ur kön vars egen post redan hunnit stängas. Det får
    // varken stänga det nya jobbet eller kasta ett fel — ett fel ger 409, och
    // kön plockar bort tryck som får 4xx.
    await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      at: new Date("2026-08-05T10:00:00Z"),
    });

    const closed = await clockOut(companyId, {
      employeeId: anna,
      momentId: svetsning,
      at: new Date("2026-08-05T08:00:00Z"),
    });

    expect(closed).toBeNull();
    expect(await getOpenEntries(forCompany(companyId), anna)).toHaveLength(1);
  });

  it("stämpla ut allt skickat två gånger stänger bara en gång", async () => {
    for (const [orderId, momentId] of [
      [orderA, svetsning],
      [orderB, montering],
    ]) {
      await clockIn(companyId, {
        kind: "ORDER",
        employeeId: anna,
        orderId,
        momentId,
        at: new Date("2026-08-05T06:00:00Z"),
      });
    }

    const punch = {
      employeeId: anna,
      clientPunchId: "ut-allt-1",
      at: new Date("2026-08-05T12:00:00Z"),
    };

    const first = await clockOutAll(companyId, punch);
    const second = await clockOutAll(companyId, punch);

    expect(first).toHaveLength(2);
    // Andra gången stänger ingenting nytt — den returnerar det som redan
    // stängdes av samma tryck.
    expect(second.map((entry) => entry.id).sort()).toEqual(
      first.map((entry) => entry.id).sort()
    );

    for (const entry of second) {
      expect(entry.clockOutAt?.toISOString()).toBe("2026-08-05T12:00:00.000Z");
    }
  });

  it("utstämplingens tryck-id sparas i sitt eget fält", async () => {
    // Postens clientPunchId bär INSTÄMPLINGEN och får inte skrivas över.
    const { started } = await clockIn(companyId, {
      kind: "ORDER",
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
      clientPunchId: "in-1",
      at: new Date("2026-08-05T06:00:00Z"),
    });

    await clockOut(companyId, {
      employeeId: anna,
      momentId: svetsning,
      clientPunchId: "ut-3",
      at: new Date("2026-08-05T12:00:00Z"),
    });

    const saved = await unsafeGlobalPrisma.timeEntry.findUniqueOrThrow({
      where: { id: started.id },
    });

    expect(saved.clientPunchId).toBe("in-1");
    expect(saved.clockOutPunchId).toBe("ut-3");
  });
});
