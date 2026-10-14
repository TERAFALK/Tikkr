import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, type CompanyDb } from "@/lib/tenant";
import {
  moveStaffBlock,
  placeStaffBlock,
  removeStaffBlock,
  resizeStaffBlock,
  staffBlocksInWeek,
  staffFor,
  staffingOf,
} from "@/lib/staff-planning";
import {
  deleteStation,
  moveBlock,
  placeBlock,
  removeBlock,
  saveStation,
  unplacedWork,
} from "@/lib/planning";

/**
 * PERSONALPASSENS VILLKOR (fas 2 av issue #21).
 *
 * `staff-planning.ts` är enda vägen in till passen. Det som ska hålla:
 *
 *  1. Personer, ordrar och rutor från ett ANNAT FÖRETAG går inte att peka ut.
 *  2. En AVAKTIVERAD person och en STÄNGD order tar inte emot pass.
 *  3. En BEMANNING gäller samma order och moment som sin ruta.
 *  4. Inget pass korsar MIDNATT.
 *  5. DUBBELBOKNING tillåts. En operatör kan köra två maskiner.
 *  6. EXAKT EN RESURS räknar av beräkningen: stationerna i Produktion,
 *     personalen i Tjänst. Bemanningen räknas aldrig två gånger.
 *  7. Flyttas en stationsruta FÖLJER BEMANNINGEN MED. Tas den bort LIGGER
 *     PASSET KVAR, utan koppling.
 */

const SE = "Europe/Stockholm";

let companyId: string;
let otherCompanyId: string;
let db: CompanyDb;

let anna: string;
let bertil: string;
let inactive: string;
let theirEmployee: string;

let orderId: string;
let closedOrderId: string;
let theirOrderId: string;

let frasning: string;
let svetsning: string;
let fras1: string;

/** Måndag 5 oktober 2026, 08:00 svensk tid. */
const MONDAY = new Date("2026-10-05T06:00:00Z");

function at(hour: number, minute = 0, day = 5): Date {
  // Oktober: Sverige ligger två timmar före UTC fram till den 25:e.
  return new Date(
    Date.UTC(2026, 9, day, hour - 2, minute)
  );
}

function pass(
  options: Partial<{
    employeeId: string;
    orderId: string;
    momentId: string;
    plannedBlockId: string | null;
    startsAt: Date;
    minutes: number;
  }> = {}
) {
  return placeStaffBlock(db, companyId, SE, {
    employeeId: options.employeeId ?? anna,
    orderId: options.orderId ?? orderId,
    momentId: options.momentId ?? frasning,
    plannedBlockId: options.plannedBlockId ?? null,
    startsAt: options.startsAt ?? at(8),
    minutes: options.minutes ?? 120,
    byEmail: "planerare@example.se",
  });
}

async function stationBlock(startsAt = at(8), minutes = 360): Promise<string> {
  const result = await placeBlock(db, companyId, SE, {
    stationId: fras1,
    orderId,
    momentId: frasning,
    startsAt,
    minutes,
    byEmail: "planerare@example.se",
  });
  expect(result.error).toBeUndefined();
  return result.id!;
}

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  const [company, other] = await Promise.all([
    unsafeGlobalPrisma.company.create({
      data: { name: `Passtest ${unique}`, timezone: SE },
    }),
    unsafeGlobalPrisma.company.create({
      data: { name: `Passtest grannen ${unique}`, timezone: SE },
    }),
  ]);

  companyId = company.id;
  otherCompanyId = other.id;
  db = forCompany(companyId);

  const person = async (name: string, active = true, owner = companyId) =>
    (
      await unsafeGlobalPrisma.employee.create({
        data: { companyId: owner, name, active },
      })
    ).id;

  anna = await person("Anna");
  bertil = await person("Bertil");
  inactive = await person("Cecilia", false);
  theirEmployee = await person("Deras Doris", true, otherCompanyId);

  frasning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Fräsning" },
    })
  ).id;
  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    })
  ).id;

  orderId = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2601" },
    })
  ).id;
  closedOrderId = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2500", status: "CLOSED" },
    })
  ).id;
  theirOrderId = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId: otherCompanyId, orderNumber: "9001" },
    })
  ).id;

  // Sex timmars fräsning beräknad på ordern.
  await unsafeGlobalPrisma.orderBudget.create({
    data: { companyId, orderId, momentId: frasning, minutes: 360 },
  });

  const saved = await saveStation(db, companyId, {
    name: "Fräs 1",
    momentId: frasning,
    days: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 7 * 60,
      endMinute: 16 * 60,
      breaks: [],
    })),
  });
  fras1 = saved.id!;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Passtest " } },
  });
});

describe("att lägga ett pass", () => {
  it("lägger ett fritt pass", async () => {
    const result = await pass();
    expect(result.error).toBeUndefined();

    const week = await staffBlocksInWeek(db, MONDAY, SE);
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({
      employeeId: anna,
      employeeName: "Anna",
      orderNumber: "2601",
      momentName: "Fräsning",
      plannedBlockId: null,
      minutes: 120,
    });
  });

  it("en person tar vilket arbetsmoment som helst", async () => {
    // En station kör ett moment. En person gör det jobbet kräver.
    expect((await pass({ momentId: svetsning })).error).toBeUndefined();
  });

  it("avvisar en person från ett annat företag", async () => {
    expect((await pass({ employeeId: theirEmployee })).error).toBe(
      "Den anställda finns inte."
    );
  });

  it("avvisar en order från ett annat företag", async () => {
    expect((await pass({ orderId: theirOrderId })).error).toBe(
      "Ordern finns inte."
    );
  });

  it("avvisar en avaktiverad person", async () => {
    expect((await pass({ employeeId: inactive })).error).toBe(
      "Den anställda är avaktiverad."
    );
  });

  it("avvisar en stängd order", async () => {
    expect((await pass({ orderId: closedOrderId })).error).toMatch(
      /avslutad/
    );
  });

  it("kapar passet vid midnatt", async () => {
    const result = await pass({ startsAt: at(22), minutes: 240 });
    expect(result.error).toBeUndefined();

    const [placed] = await staffBlocksInWeek(db, MONDAY, SE);
    expect(placed.minutes).toBe(120);
  });

  it("tillåter två pass samtidigt för samma person", async () => {
    // En operatör som kör två maskiner. Tavlan varnar, servern vägrar inte.
    expect((await pass()).error).toBeUndefined();
    expect((await pass({ momentId: svetsning })).error).toBeUndefined();

    expect(await staffBlocksInWeek(db, MONDAY, SE)).toHaveLength(2);
  });

  it("visar inte grannens pass", async () => {
    await placeStaffBlock(forCompany(otherCompanyId), otherCompanyId, SE, {
      employeeId: theirEmployee,
      orderId: theirOrderId,
      momentId: (
        await unsafeGlobalPrisma.workMoment.create({
          data: { companyId: otherCompanyId, name: "Deras moment" },
        })
      ).id,
      startsAt: at(8),
      minutes: 60,
      byEmail: "granne@example.se",
    });

    expect(await staffBlocksInWeek(db, MONDAY, SE)).toEqual([]);
  });
});

describe("bemanning av en stationsruta", () => {
  it("kopplas till rutan och visas som rutans bemanning", async () => {
    const blockId = await stationBlock();

    const result = await pass({ plannedBlockId: blockId, minutes: 60 });
    expect(result.error).toBeUndefined();

    const staffing = await staffingOf(db, [blockId]);
    expect(staffing[blockId]).toHaveLength(1);
    expect(staffing[blockId][0]).toMatchObject({
      employeeName: "Anna",
      stationName: "Fräs 1",
      minutes: 60,
    });
  });

  it("avvisar en bemanning som gäller ett annat jobb än rutan", async () => {
    const blockId = await stationBlock();

    expect(
      (await pass({ plannedBlockId: blockId, momentId: svetsning })).error
    ).toBe("Passet gäller ett annat jobb än rutan.");
  });

  it("avvisar en ruta från ett annat företag", async () => {
    const theirs = forCompany(otherCompanyId);
    const theirMoment = await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: otherCompanyId, name: "Deras fräsning" },
    });
    const theirStation = await saveStation(theirs, otherCompanyId, {
      name: "Deras fräs",
      momentId: theirMoment.id,
      days: [],
    });
    const theirBlock = await placeBlock(theirs, otherCompanyId, SE, {
      stationId: theirStation.id!,
      orderId: theirOrderId,
      momentId: theirMoment.id,
      startsAt: at(8),
      minutes: 60,
      byEmail: "granne@example.se",
    });

    expect((await pass({ plannedBlockId: theirBlock.id! })).error).toBe(
      "Rutan finns inte."
    );
  });

  it("följer med när rutan flyttas, lika långt", async () => {
    const blockId = await stationBlock(at(8));
    await pass({ plannedBlockId: blockId, startsAt: at(7), minutes: 60 });

    // Till tisdag 10:00: två timmar senare och en dag fram.
    const moved = await moveBlock(db, SE, blockId, fras1, at(10, 0, 6));
    expect(moved.error).toBeUndefined();

    const [staff] = (await staffingOf(db, [blockId]))[blockId];
    expect(staff.startsAt.toISOString()).toBe(at(9, 0, 6).toISOString());
    expect(staff.minutes).toBe(60);
  });

  it("ligger kvar utan koppling när rutan tas bort", async () => {
    const blockId = await stationBlock();
    await pass({ plannedBlockId: blockId });

    await removeBlock(db, blockId);

    const week = await staffBlocksInWeek(db, MONDAY, SE);
    expect(week).toHaveLength(1);
    expect(week[0].plannedBlockId).toBeNull();
    expect(week[0].stationName).toBeNull();
  });

  it("ligger kvar när hela stationen tas bort", async () => {
    const blockId = await stationBlock();
    await pass({ plannedBlockId: blockId });

    await deleteStation(db, fras1);

    expect(await staffBlocksInWeek(db, MONDAY, SE)).toHaveLength(1);
  });
});

describe("vem som räknar av beräkningen", () => {
  it("i Produktion räknar stationen, och bemanningen räknas inte", async () => {
    const blockId = await stationBlock(at(8), 240);
    await pass({ plannedBlockId: blockId, minutes: 240 });

    const [row] = (await unplacedWork(db, "stations")).filter(
      (item) => item.orderId === orderId
    );

    // Sex beräknade, fyra på stationen. Bemanningens fyra räknas inte.
    expect(row.placedMinutes).toBe(240);
    expect(row.remainingMinutes).toBe(120);
  });

  it("i Tjänst räknar personalen, och stationernas rutor räknas inte", async () => {
    await stationBlock(at(8), 60);
    await pass({ minutes: 240 });

    const [row] = (await unplacedWork(db, "staff")).filter(
      (item) => item.orderId === orderId
    );

    expect(row.placedMinutes).toBe(240);
    expect(row.remainingMinutes).toBe(120);
    expect(row.plannable).toBe(true);
  });

  it("ingen tid faller bort när ett pass krymps", async () => {
    const result = await pass({ minutes: 240 });
    await resizeStaffBlock(db, SE, result.id!, 60);

    const [row] = (await unplacedWork(db, "staff")).filter(
      (item) => item.orderId === orderId
    );

    expect(row.placedMinutes + row.remainingMinutes).toBe(360);
    expect(row.remainingMinutes).toBe(300);
  });

  it("utan aktiva anställda går ingenting att planera i Tjänst", async () => {
    await unsafeGlobalPrisma.employee.updateMany({
      where: { companyId },
      data: { active: false },
    });

    const rows = await unplacedWork(db, "staff");
    expect(rows.every((row) => !row.plannable)).toBe(true);
  });
});

describe("att ändra ett pass", () => {
  it("flyttar till en annan person och tid", async () => {
    const result = await pass();

    const moved = await moveStaffBlock(db, SE, result.id!, bertil, at(13));
    expect(moved.error).toBeUndefined();

    const [placed] = await staffBlocksInWeek(db, MONDAY, SE);
    expect(placed.employeeId).toBe(bertil);
    expect(placed.startsAt.toISOString()).toBe(at(13).toISOString());
  });

  it("flyttar inte till en person hos ett annat företag", async () => {
    const result = await pass();

    expect(
      (await moveStaffBlock(db, SE, result.id!, theirEmployee, at(13))).error
    ).toBe("Den anställda finns inte.");
  });

  it("rör inte grannens pass", async () => {
    const theirs = forCompany(otherCompanyId);
    const moment = await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: otherCompanyId, name: "Deras moment" },
    });
    const their = await placeStaffBlock(theirs, otherCompanyId, SE, {
      employeeId: theirEmployee,
      orderId: theirOrderId,
      momentId: moment.id,
      startsAt: at(8),
      minutes: 60,
      byEmail: "granne@example.se",
    });

    await removeStaffBlock(db, their.id!);
    expect(
      (await resizeStaffBlock(db, SE, their.id!, 30)).error
    ).toBe("Passet finns inte.");

    expect(await staffBlocksInWeek(theirs, MONDAY, SE)).toHaveLength(1);
  });

  it("tar bort ett pass", async () => {
    const result = await pass();
    await removeStaffBlock(db, result.id!);

    expect(await staffBlocksInWeek(db, MONDAY, SE)).toEqual([]);
  });
});

describe("raderna på tavlan", () => {
  it("är de aktiva anställda i bokstavsordning", async () => {
    const staff = await staffFor(db);
    expect(staff.map((member) => member.name)).toEqual(["Anna", "Bertil"]);
  });
});
