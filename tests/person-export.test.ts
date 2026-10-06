import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { buildPersonExport } from "@/lib/person-export";

/**
 * REGISTERUTDRAG.
 *
 * Det testerna skyddar: utdraget innehåller löneunderlagets register och
 * porträttet, inte bara stämplingarna, och en anställd hos ett annat företag
 * ger ingenting.
 */

let companyId: string;
let otherCompanyId: string;
let anna: string;

beforeAll(async () => {
  companyId = (
    await unsafeGlobalPrisma.company.create({ data: { name: "Utdragstest AB" } })
  ).id;
  otherCompanyId = (
    await unsafeGlobalPrisma.company.create({ data: { name: "Utdragstest Annan AB" } })
  ).id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: {
        companyId,
        name: "Anna Åberg",
        photoData: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        photoMimeType: "image/png",
      },
    })
  ).id;

  const order = await unsafeGlobalPrisma.order.create({
    data: { companyId, orderNumber: "8001" },
  });
  const moment = await unsafeGlobalPrisma.workMoment.create({
    data: { companyId, name: "Svetsning" },
  });
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId: anna,
      orderId: order.id,
      momentId: moment.id,
      clockInAt: new Date("2026-09-01T06:00:00Z"),
      clockOutAt: new Date("2026-09-01T14:00:00Z"),
    },
  });
  const reason = await unsafeGlobalPrisma.absenceReason.create({
    data: { companyId, name: "Sjuk" },
  });
  await unsafeGlobalPrisma.absence.create({
    data: {
      companyId,
      employeeId: anna,
      date: new Date("2026-09-02T00:00:00Z"),
      reasonId: reason.id,
      createdByEmail: "chef@test.se",
    },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.timeEntry.deleteMany({ where: { companyId } });
  await unsafeGlobalPrisma.absence.deleteMany({ where: { companyId } });
  await unsafeGlobalPrisma.company.deleteMany({
    where: { id: { in: [companyId, otherCompanyId] } },
  });
});

describe("buildPersonExport", () => {
  it("ger ett arkiv med arket och porträttet", async () => {
    const result = await buildPersonExport(
      forCompany(companyId),
      anna,
      "Europe/Stockholm"
    );

    expect(result).not.toBeNull();
    expect(result!.fileName).toMatch(/^registerutdrag-anna-aberg-.*\.zip$/);

    // Filnamnen står i klartext i ett zip-arkiv.
    const raw = result!.data.toString("latin1");
    expect(raw).toContain("registerutdrag.xlsx");
    expect(raw).toContain("portratt.png");
  });

  it("ett annat företag får ingenting", async () => {
    expect(
      await buildPersonExport(forCompany(otherCompanyId), anna, "Europe/Stockholm")
    ).toBeNull();
  });
});
