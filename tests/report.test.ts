import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { buildReport } from "@/lib/report";
import { toDecimalHours, formatDuration } from "@/lib/format";

/**
 * Rapportsummeringen — siffrorna som blir en faktura.
 *
 * Testdatan är medvetet enkel att räkna i huvudet, så att ett fel i logiken
 * syns direkt istället för att gömma sig i ett krångligt exempel.
 */

let companyId: string;
let anna: string;
let bosse: string;
let orderA: string;
let orderB: string;
let svetsning: string;
let montering: string;

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: "Rapporttest AB" },
  });
  companyId = company.id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna" },
    })
  ).id;
  bosse = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Bosse" },
    })
  ).id;

  orderA = (
    await unsafeGlobalPrisma.order.create({
      data: {
        companyId,
        orderNumber: "9001",
        customerId: (
          await unsafeGlobalPrisma.customer.create({
            data: { companyId, name: "Kund A" },
          })
        ).id,
      },
    })
  ).id;
  orderB = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "9002" },
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

  const entry = (
    employeeId: string,
    orderId: string,
    momentId: string,
    from: string,
    to: string | null,
    extra: Record<string, unknown> = {}
  ) =>
    unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId,
        orderId,
        momentId,
        clockInAt: new Date(from),
        clockOutAt: to ? new Date(to) : null,
        ...extra,
      },
    });

  // Anna: 2 tim svetsning + 1 tim montering på order 9001
  await entry(anna, orderA, svetsning, "2026-08-03T06:00:00Z", "2026-08-03T08:00:00Z");
  await entry(anna, orderA, montering, "2026-08-03T08:00:00Z", "2026-08-03T09:00:00Z");
  // Bosse: 3 tim svetsning på order 9001
  await entry(bosse, orderA, svetsning, "2026-08-03T06:00:00Z", "2026-08-03T09:00:00Z");
  // Bosse: 4 tim svetsning på order 9002, en annan dag
  await entry(bosse, orderB, svetsning, "2026-08-05T06:00:00Z", "2026-08-05T10:00:00Z");
  // Anna: en post som systemet stängt och som väntar på granskning
  await entry(anna, orderB, montering, "2026-08-06T06:00:00Z", "2026-08-06T16:00:00Z", {
    source: "AUTO_CLOSE",
    needsReview: true,
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.$disconnect();
});

describe("summering utan filter", () => {
  it("räknar all tid", async () => {
    const report = await buildReport(forCompany(companyId));

    // 2 + 1 + 3 + 4 + 10 = 20 timmar
    expect(report.rows).toHaveLength(5);
    expect(report.totalMinutes).toBe(20 * 60);
  });

  it("summerar per order, störst först", async () => {
    const report = await buildReport(forCompany(companyId));

    expect(report.byOrder[0].label).toBe("9002"); // 4 + 10 = 14 tim
    expect(report.byOrder[0].minutes).toBe(14 * 60);
    expect(report.byOrder[1].label).toBe("9001"); // 2 + 1 + 3 = 6 tim
    expect(report.byOrder[1].minutes).toBe(6 * 60);
  });

  it("summerar per anställd", async () => {
    const report = await buildReport(forCompany(companyId));
    const perName = Object.fromEntries(
      report.byEmployee.map((group) => [group.label, group.minutes])
    );

    expect(perName["Anna"]).toBe(13 * 60); // 2 + 1 + 10
    expect(perName["Bosse"]).toBe(7 * 60); // 3 + 4
  });

  it("summerar per arbetsmoment", async () => {
    const report = await buildReport(forCompany(companyId));
    const perMoment = Object.fromEntries(
      report.byMoment.map((group) => [group.label, group.minutes])
    );

    expect(perMoment["Svetsning"]).toBe(9 * 60); // 2 + 3 + 4
    expect(perMoment["Montering"]).toBe(11 * 60); // 1 + 10
  });

  it("räknar poster som behöver granskas", async () => {
    const report = await buildReport(forCompany(companyId));
    expect(report.needsReviewCount).toBe(1);
  });
});

describe("filter", () => {
  it("filtrerar på order", async () => {
    const report = await buildReport(forCompany(companyId), { orderId: orderA });

    expect(report.rows).toHaveLength(3);
    expect(report.totalMinutes).toBe(6 * 60);
  });

  it("filtrerar på anställd", async () => {
    const report = await buildReport(forCompany(companyId), {
      employeeId: bosse,
    });

    expect(report.totalMinutes).toBe(7 * 60);
  });

  it("filtrerar på arbetsmoment", async () => {
    const report = await buildReport(forCompany(companyId), {
      momentId: svetsning,
    });

    expect(report.totalMinutes).toBe(9 * 60);
  });

  it("filtrerar på datumintervall", async () => {
    const report = await buildReport(forCompany(companyId), {
      from: new Date("2026-08-03T00:00:00Z"),
      to: new Date("2026-08-03T23:59:59Z"),
    });

    expect(report.rows).toHaveLength(3);
    expect(report.totalMinutes).toBe(6 * 60);
  });

  it("kombinerar flera filter", async () => {
    const report = await buildReport(forCompany(companyId), {
      employeeId: anna,
      orderId: orderA,
      momentId: svetsning,
    });

    expect(report.rows).toHaveLength(1);
    expect(report.totalMinutes).toBe(2 * 60);
  });

  it("ger tomt resultat istället för fel när inget matchar", async () => {
    const report = await buildReport(forCompany(companyId), {
      from: new Date("2030-01-01T00:00:00Z"),
    });

    expect(report.rows).toEqual([]);
    expect(report.totalMinutes).toBe(0);
    expect(report.byOrder).toEqual([]);
  });
});

describe("pågående jobb", () => {
  it("räknas fram till nu och märks ut", async () => {
    const started = new Date(Date.now() - 90 * 60 * 1000);
    const open = await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: anna,
        orderId: orderA,
        momentId: svetsning,
        clockInAt: started,
      },
    });

    const report = await buildReport(forCompany(companyId), { orderId: orderA });
    const row = report.rows.find((candidate) => candidate.id === open.id);

    expect(row?.ongoing).toBe(true);
    // Ungefär 90 minuter — exakt värde går inte att kräva, klockan går.
    expect(row!.minutes).toBeGreaterThan(89);
    expect(row!.minutes).toBeLessThan(92);

    await unsafeGlobalPrisma.timeEntry.delete({ where: { id: open.id } });
  });
});

describe("omräkning till fakturerbara timmar", () => {
  it("minuter blir decimaltimmar", () => {
    expect(toDecimalHours(120)).toBe(2);
    expect(toDecimalHours(90)).toBe(1.5);
    expect(toDecimalHours(20)).toBe(0.33);
    expect(toDecimalHours(0)).toBe(0);
  });

  it("minuter blir timmar och minuter", () => {
    expect(formatDuration(120)).toBe("2:00");
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("fyller alltid minutdelen till två siffror", () => {
    // "7:5" skulle läsas som sju och en halv timme.
    expect(formatDuration(425)).toBe("7:05");
    expect(formatDuration(3002)).toBe("50:02");
  });

  it("låter timdelen växa fritt", () => {
    // En order kan ha hundratals timmar på sig. Ingen modulo 24 här.
    expect(formatDuration(60 * 312 + 45)).toBe("312:45");
  });

  it("avrundar till hela minuter", () => {
    // minutesBetween ger decimaltal; avrundningen sker först här.
    expect(formatDuration(89.6)).toBe("1:30");
    expect(formatDuration(0.4)).toBe("0:00");
  });
});

describe("improduktiv tid hålls utanför fakturaunderlaget", () => {
  let stadning: string;

  beforeAll(async () => {
    stadning = (
      await unsafeGlobalPrisma.indirectMoment.create({
        data: { companyId, name: "Städning" },
      })
    ).id;

    // Två timmar städning samma dag som den övriga testdatan.
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: anna,
        kind: "INDIRECT",
        indirectMomentId: stadning,
        clockInAt: new Date("2026-08-05T13:00:00Z"),
        clockOutAt: new Date("2026-08-05T15:00:00Z"),
      },
    });
  });

  it("rapporten räknar som standard bara tid som ska faktureras", async () => {
    // Filtret är utelämnat. Glömska ska ge fakturerbar tid, aldrig tvärtom.
    const report = await buildReport(forCompany(companyId), {});

    expect(report.rows.every((row) => row.billable)).toBe(true);
    expect(report.indirectMinutes).toBe(0);
    expect(report.byIndirect).toHaveLength(0);
  });

  it("städtimmarna finns när man ber om dem", async () => {
    const report = await buildReport(forCompany(companyId), {
      kind: "INDIRECT",
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].billable).toBe(false);
    expect(report.rows[0].orderNumber).toBeNull();
    expect(report.rows[0].label).toBe("Städning");
    expect(report.indirectMinutes).toBe(120);
    expect(report.billableMinutes).toBe(0);
  });

  it("summeringen per order innehåller ingen improduktiv tid", async () => {
    const report = await buildReport(forCompany(companyId), { kind: "ALL" });

    // Utan uppdelningen hade en Map-nyckel blivit tom och gett en tyst
    // skräpgrupp mitt i ett fakturaunderlag.
    expect(report.byOrder.every((group) => group.key !== "")).toBe(true);
    expect(report.byMoment.every((group) => group.key !== "")).toBe(true);
  });

  it("med båda sorterna redovisas de var för sig", async () => {
    const report = await buildReport(forCompany(companyId), { kind: "ALL" });

    expect(report.indirectMinutes).toBe(120);
    expect(report.billableMinutes).toBeGreaterThan(0);
    expect(report.totalMinutes).toBe(
      report.billableMinutes + report.indirectMinutes
    );
    expect(report.byIndirect).toHaveLength(1);
    expect(report.byIndirect[0].label).toBe("Städning");
  });

  it("per anställd räknas båda sorterna när man bett om båda", async () => {
    // Här är det riktigt att slå ihop: frågan är hur mycket personen jobbat,
    // inte hur mycket som ska faktureras.
    const report = await buildReport(forCompany(companyId), { kind: "ALL" });
    const annas = report.byEmployee.find((group) => group.label === "Anna");

    expect(annas?.minutes).toBeGreaterThanOrEqual(120);
  });
});
