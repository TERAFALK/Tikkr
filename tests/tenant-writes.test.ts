import { describe, it, expect, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, TenantIsolationError } from "@/lib/tenant";

/**
 * VAD SOM SKRIVS GENOM DEN FÖRETAGSLÅSTA KLIENTEN (2026-10-18).
 *
 * Lagret filtrerade varje fråga på företaget och stämplade varje ny rad, men
 * prövade inte det som skrevs vid en ändring eller i en nästlad skrivning:
 *
 *   - `update({ data: { companyId } })` kunde flytta en egen rad till ett
 *     annat företag.
 *   - `employee: { connect: { id } }` kunde koppla en rad till ett annat
 *     företags anställd, och en nästlad `create` fick inget företag prövat.
 *
 * Alla fall här avvisas i lagret innan någon fråga når databasen, så filen
 * behöver ingen databas. Att en nästlad `create` med rätt företag fortfarande
 * fungerar prövas mot databasen i tenant-isolation.test.ts.
 */

const OURS = "foretag-vart";
const THEIRS = "foretag-deras";

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("en ändring flyttar aldrig en rad till ett annat företag", () => {
  it("update med ett annat companyId avvisas", async () => {
    const db = forCompany(OURS);

    await expect(
      db.employee.update({ where: { id: "x" }, data: { companyId: THEIRS } })
    ).rejects.toThrow(TenantIsolationError);
  });

  it("updateMany med ett annat companyId avvisas", async () => {
    const db = forCompany(OURS);

    await expect(
      db.order.updateMany({ where: {}, data: { companyId: THEIRS } })
    ).rejects.toThrow(TenantIsolationError);
  });

  it("upsert som flyttar raden vid ändring avvisas", async () => {
    const db = forCompany(OURS);

    await expect(
      db.holiday.upsert({
        where: { companyId_date: { companyId: OURS, date: new Date() } },
        update: { companyId: THEIRS },
        create: { companyId: OURS, date: new Date(), name: "Midsommarafton", createdByEmail: "a@b.se" },
      })
    ).rejects.toThrow(TenantIsolationError);
  });
});

describe("nästlade skrivningar", () => {
  it("connect till en befintlig rad avvisas", async () => {
    const db = forCompany(OURS);

    await expect(
      db.timeEntry.update({
        where: { id: "x" },
        data: { employee: { connect: { id: "deras-anstallda" } } },
      })
    ).rejects.toThrow(TenantIsolationError);
  });

  it("connect i en ny rad avvisas", async () => {
    const db = forCompany(OURS);

    await expect(
      db.order.create({
        // Den kopplade formen, som Prismas typer släpper igenom: företaget
        // och kunden som kopplingar i stället för id-fält.
        data: {
          orderNumber: "2601",
          company: { connect: { id: OURS } },
          customer: { connect: { id: "deras-kund" } },
        },
      })
    ).rejects.toThrow(TenantIsolationError);
  });

  it("en nästlad ny rad utan företag avvisas", async () => {
    const db = forCompany(OURS);

    await expect(
      db.stationDay.create({
        data: {
          companyId: OURS,
          stationId: "station",
          weekday: 1,
          startMinute: 360,
          endMinute: 960,
          // Saknar companyId. Prismas typ kräver det, och här tvingas typen
          // bort med flit: det är vad lagret ska stå emot.
          breaks: { create: [{ startMinute: 720, endMinute: 760 }] },
        } as never,
      })
    ).rejects.toThrow(TenantIsolationError);
  });

  it("en nästlad ny rad med ett annat företag avvisas", async () => {
    const db = forCompany(OURS);

    await expect(
      db.scheduleDay.create({
        data: {
          companyId: OURS,
          scheduleId: "schema",
          weekday: 1,
          startMinute: 390,
          endMinute: 960,
          breaks: {
            create: [{ companyId: THEIRS, startMinute: 720, endMinute: 760 }],
          },
        },
      })
    ).rejects.toThrow(TenantIsolationError);
  });

  it("varje nästlad skrivning vid en ändring avvisas, även en ny rad", async () => {
    const db = forCompany(OURS);

    await expect(
      db.scheduleDay.update({
        where: { id: "x" },
        data: {
          breaks: { create: [{ companyId: OURS, startMinute: 720, endMinute: 760 }] },
        },
      })
    ).rejects.toThrow(TenantIsolationError);
  });
});
