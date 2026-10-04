import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, type CompanyDb } from "@/lib/tenant";
import {
  blocksInWeek,
  moveBlock,
  deleteStation,
  moveStation,
  placeBlock,
  removeBlock,
  resizeBlock,
  saveStation,
  setStationActive,
  stationsFor,
  unplacedWork,
} from "@/lib/planning";
import { SNAP_MINUTES } from "@/lib/plan-calendar";

/**
 * PLANERINGENS VILLKOR.
 *
 * `planning.ts` är enda vägen in till stationerna och rutorna, precis som
 * `clock.ts` är enda vägen in till stämplingarna. Villkoren nedan kan inte
 * uttryckas i databasen, så om de inte vaktas här vaktas de ingenstans:
 *
 *  1. En ruta ligger på en station som KÖR DESS ARBETSMOMENT.
 *  2. Ordrar och stationer från ett ANNAT FÖRETAG går inte att peka ut.
 *  3. En STÄNGD order tar inte emot planerad tid.
 *  4. Ingen ruta korsar MIDNATT.
 *  5. INGEN TID FALLER BORT: planerat plus oplacerat är alltid det beräknade.
 *
 * Det femte är modulens enda hårda krav mot användaren, och det enda som är
 * svårt att se att man brutit mot.
 */

const SE = "Europe/Stockholm";

let companyId: string;
let otherCompanyId: string;
let db: CompanyDb;

let orderId: string;
let closedOrderId: string;
let theirOrderId: string;

let frasning: string;
let svetsning: string;

let fras1: string;
let fras2: string;
let svetsbas: string;
let theirStationId: string;

/** Måndag 5 oktober 2026, 08:00 svensk tid. */
const MONDAY = new Date("2026-10-05T06:00:00Z");

function at(hour: number, minute = 0, day = 5): Date {
  // Oktober: Sverige ligger två timmar före UTC fram till den 25:e.
  const utcHour = hour - 2;
  return new Date(
    `2026-10-${String(day).padStart(2, "0")}T${String(utcHour).padStart(
      2,
      "0"
    )}:${String(minute).padStart(2, "0")}:00Z`
  );
}

/** Lägger upp en station med vanliga tider: mån–fre 07:00–16:00, lunch 40 min. */
async function station(name: string, momentId: string): Promise<string> {
  const result = await saveStation(db, companyId, {
    name,
    momentId,
    days: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 7 * 60,
      endMinute: 16 * 60,
      breaks: [{ startMinute: 12 * 60, endMinute: 12 * 60 + 40 }],
    })),
  });

  expect(result.error).toBeUndefined();
  return result.id!;
}

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  const [company, other] = await Promise.all([
    unsafeGlobalPrisma.company.create({
      data: { name: `Planeringstest ${unique}`, timezone: SE },
    }),
    unsafeGlobalPrisma.company.create({
      data: { name: `Planeringstest grannen ${unique}`, timezone: SE },
    }),
  ]);

  companyId = company.id;
  otherCompanyId = other.id;
  db = forCompany(companyId);

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

  fras1 = await station("Fräs 1", frasning);
  fras2 = await station("Fräs 2", frasning);
  svetsbas = await station("Svetsbås", svetsning);

  const theirMoment = await unsafeGlobalPrisma.workMoment.create({
    data: { companyId: otherCompanyId, name: "Deras fräsning" },
  });

  theirStationId = (
    await unsafeGlobalPrisma.station.create({
      data: {
        companyId: otherCompanyId,
        name: "Deras fräs",
        momentId: theirMoment.id,
      },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Planeringstest " } },
  });
});

/** Placerar en ruta med vanliga värden och ger tillbaka svaret. */
function place(options: {
  stationId?: string;
  orderId?: string;
  momentId?: string;
  startsAt?: Date;
  minutes?: number;
} = {}) {
  return placeBlock(db, companyId, SE, {
    stationId: options.stationId ?? fras1,
    orderId: options.orderId ?? orderId,
    momentId: options.momentId ?? frasning,
    startsAt: options.startsAt ?? at(8),
    minutes: options.minutes ?? 240,
    byEmail: "admin@example.com",
  });
}

describe("stationens arbetsmoment", () => {
  it("en ruta går att lägga på en station som kör momentet", async () => {
    const result = await place();

    expect(result.error).toBeUndefined();
    expect(result.id).toBeTruthy();
  });

  it("samma moment går på FLERA stationer", async () => {
    // Hela skälet att stationen och momentet är skilda saker. En verkstad har
    // två fräsar, och båda ska kunna köra samma sorts jobb.
    expect((await place({ stationId: fras1 })).error).toBeUndefined();
    expect((await place({ stationId: fras2 })).error).toBeUndefined();
  });

  it("en ruta går INTE att lägga på en station med ett annat moment", async () => {
    const result = await place({ stationId: svetsbas });

    expect(result.error).toMatch(/annat arbetsmoment/);
    expect(result.id).toBeUndefined();
  });

  it("en ruta går INTE att flytta till en station med ett annat moment", async () => {
    const { id } = await place();

    const result = await moveBlock(db, SE, id!, svetsbas, at(9));

    expect(result.error).toMatch(/annat arbetsmoment/);

    // Och rutan ligger kvar där den låg.
    const after = await db.plannedBlock.findFirst({ where: { id } });
    expect(after?.stationId).toBe(fras1);
  });

  it("en ruta går att flytta mellan stationer med SAMMA moment", async () => {
    const { id } = await place();

    const result = await moveBlock(db, SE, id!, fras2, at(9));

    expect(result.error).toBeUndefined();

    const after = await db.plannedBlock.findFirst({ where: { id } });
    expect(after?.stationId).toBe(fras2);
  });
});

describe("företagsgränsen", () => {
  it("en annan kunds order går inte att planera", async () => {
    // Id:t kommer från ett formulär, alltså utifrån. Filtreringslagret
    // stämplar vårt företag på raden men kan inte veta vad det utpekade id:t
    // tillhör — kontrollen måste göras i planning.ts.
    const result = await place({ orderId: theirOrderId });

    expect(result.error).toMatch(/Ordern finns inte/);
  });

  it("en annan kunds station går inte att planera på", async () => {
    const result = await place({ stationId: theirStationId });

    expect(result.error).toMatch(/Stationen finns inte/);
  });

  it("en annan kunds ruta går inte att flytta", async () => {
    const theirBlock = await unsafeGlobalPrisma.plannedBlock.create({
      data: {
        companyId: otherCompanyId,
        stationId: theirStationId,
        orderId: theirOrderId,
        momentId: (
          await unsafeGlobalPrisma.station.findUniqueOrThrow({
            where: { id: theirStationId },
          })
        ).momentId,
        startsAt: at(8),
        minutes: 60,
        createdByEmail: "granne@example.com",
      },
    });

    expect((await moveBlock(db, SE, theirBlock.id, fras1, at(9))).error).toMatch(
      /Rutan finns inte/
    );
    expect((await resizeBlock(db, SE, theirBlock.id, 120)).error).toMatch(
      /Rutan finns inte/
    );

    // removeBlock svarar inte med ett fel — deleteMany träffar ingen rad
    // genom företagsfiltret. Det viktiga är att raden står kvar.
    await removeBlock(db, theirBlock.id);

    const still = await unsafeGlobalPrisma.plannedBlock.findUnique({
      where: { id: theirBlock.id },
    });
    expect(still).not.toBeNull();
  });
});

describe("stängd order", () => {
  it("tar inte emot planerad tid", async () => {
    // Samma hållning som clock.ts: ett avslutat jobb tar inte emot ny tid,
    // varken stämplad eller planerad.
    const result = await place({ orderId: closedOrderId });

    expect(result.error).toMatch(/avslutad/);
  });
});

describe("rutans längd och läge", () => {
  it("snäpps till kvart", async () => {
    const { id } = await place({ minutes: 37 });

    const block = await db.plannedBlock.findFirst({ where: { id } });
    expect(block?.minutes).toBe(30);
    expect(block!.minutes % SNAP_MINUTES).toBe(0);
  });

  it("blir aldrig noll minuter", async () => {
    // En ruta utan längd är inte en ruta. Den som drar ihop en helt ska ta
    // bort den, inte lämna en osynlig rad i databasen.
    const { id } = await place({ minutes: 0 });

    const block = await db.plannedBlock.findFirst({ where: { id } });
    expect(block?.minutes).toBe(SNAP_MINUTES);
  });

  it("kapas mot midnatt i stället för att korsa dygnet", async () => {
    // Tio timmar från 22:00 ryms inte. Rutan blir två timmar, och återstoden
    // ligger kvar som oplacerad — ingen tid faller bort.
    const { id } = await place({ startsAt: at(22), minutes: 600 });

    const block = await db.plannedBlock.findFirst({ where: { id } });
    expect(block?.minutes).toBe(120);
  });

  it("krymper när den flyttas till en starttid där den inte ryms", async () => {
    const { id } = await place({ minutes: 240 });

    await moveBlock(db, SE, id!, fras1, at(23));

    const block = await db.plannedBlock.findFirst({ where: { id } });
    expect(block?.minutes).toBe(60);
  });

  it("tillåter överbokning utanför öppettiderna", async () => {
    // Administratören vet ibland att maskinen ska gå över kvällen. Tavlan
    // varnar i gult; planeringen vägrar inte.
    const result = await place({ startsAt: at(15), minutes: 240 });

    expect(result.error).toBeUndefined();
  });

  it("tillåter två rutor som ligger i varandra", async () => {
    expect((await place({ startsAt: at(8), minutes: 240 })).error).toBeUndefined();
    expect((await place({ startsAt: at(9), minutes: 60 })).error).toBeUndefined();
  });
});

describe("ingen tid faller bort", () => {
  it("oplacerat är beräknat minus placerat", async () => {
    const before = await unplacedWork(db);
    const row = before.find((item) => item.momentId === frasning)!;

    expect(row.budgetMinutes).toBe(360);
    expect(row.placedMinutes).toBe(0);
    expect(row.remainingMinutes).toBe(360);

    await place({ minutes: 240 });

    const after = await unplacedWork(db);
    const now = after.find((item) => item.momentId === frasning)!;

    expect(now.placedMinutes).toBe(240);
    expect(now.remainingMinutes).toBe(120);

    // DEN AVGÖRANDE EGENSKAPEN: summan är alltid den beräknade tiden.
    expect(now.placedMinutes + now.remainingMinutes).toBe(360);
  });

  it("minuterna kommer tillbaka när en ruta krymps", async () => {
    const { id } = await place({ minutes: 240 });

    await resizeBlock(db, SE, id!, 60);

    const row = (await unplacedWork(db)).find(
      (item) => item.momentId === frasning
    )!;

    expect(row.placedMinutes).toBe(60);
    expect(row.remainingMinutes).toBe(300);
  });

  it("minuterna kommer tillbaka när en ruta tas bort", async () => {
    const { id } = await place({ minutes: 240 });
    await removeBlock(db, id!);

    const row = (await unplacedWork(db)).find(
      (item) => item.momentId === frasning
    )!;

    expect(row.placedMinutes).toBe(0);
    expect(row.remainingMinutes).toBe(360);
  });

  it("räknar rutor i ALLA veckor, inte bara den visade", async () => {
    // En ruta som ligger i nästa månad är placerad. Räknade vi bara veckans
    // skulle samma tid kunna placeras två gånger.
    await place({ startsAt: at(8), minutes: 120 });
    await place({ startsAt: new Date("2026-12-07T07:00:00Z"), minutes: 120 });

    const row = (await unplacedWork(db)).find(
      (item) => item.momentId === frasning
    )!;

    expect(row.placedMinutes).toBe(240);
    expect(row.remainingMinutes).toBe(120);
  });

  it("går negativt när mer planeras än beräknats", async () => {
    // Tillåtet. Systemet stoppar aldrig planering för att en beräkning
    // överskrids, lika lite som det stoppar stämpling.
    await place({ minutes: 480 });

    const row = (await unplacedWork(db)).find(
      (item) => item.momentId === frasning
    )!;

    expect(row.remainingMinutes).toBeLessThan(0);
  });

  it("visar ett planerat moment som ordern inte har beräknat", async () => {
    // Kontoret hinner inte alltid räkna innan jobbet måste in i veckan. Tiden
    // ska synas ändå, men utan återstod — det finns ingen beräkning att räkna
    // ned.
    const result = await placeBlock(db, companyId, SE, {
      stationId: svetsbas,
      orderId,
      momentId: svetsning,
      startsAt: at(8),
      minutes: 120,
      byEmail: "admin@example.com",
    });

    expect(result.error).toBeUndefined();

    const row = (await unplacedWork(db)).find(
      (item) => item.momentId === svetsning
    )!;

    expect(row.budgetMinutes).toBeNull();
    expect(row.placedMinutes).toBe(120);
    expect(row.remainingMinutes).toBe(0);
  });

  it("tar inte med stängda ordrar", async () => {
    await unsafeGlobalPrisma.orderBudget.create({
      data: {
        companyId,
        orderId: closedOrderId,
        momentId: frasning,
        minutes: 120,
      },
    });

    const rows = await unplacedWork(db);

    expect(rows.some((row) => row.orderId === closedOrderId)).toBe(false);
  });

  it("säger när inget moment kan göras av någon station", async () => {
    await unsafeGlobalPrisma.station.deleteMany({ where: { companyId } });

    const rows = await unplacedWork(db);

    expect(rows.every((row) => row.plannable === false)).toBe(true);
  });
});

describe("veckans rutor", () => {
  it("hämtar veckans och inte nästa veckas", async () => {
    await place({ startsAt: at(8, 0, 5), minutes: 60 });
    await place({ startsAt: at(8, 0, 9), minutes: 60 });

    // Måndagen efter.
    await place({ startsAt: at(8, 0, 12), minutes: 60 });

    const week = await blocksInWeek(db, MONDAY, SE);

    expect(week).toHaveLength(2);
  });

  it("bär med ordernummer och momentnamn", async () => {
    await place();

    const [block] = await blocksInWeek(db, MONDAY, SE);

    expect(block.orderNumber).toBe("2601");
    expect(block.momentName).toBe("Fräsning");
  });
});

describe("stationsregistret", () => {
  it("vägrar två stationer med samma namn", async () => {
    const result = await saveStation(db, companyId, {
      name: "Fräs 1",
      momentId: frasning,
      days: [],
    });

    expect(result.error).toMatch(/redan en station/);
  });

  it("vägrar byta arbetsmoment när rutor finns", async () => {
    // Varje ruta skulle annars tyst börja peka på en annan beräkningsrad: en
    // order med fyra timmars fräsning planerad skulle plötsligt ha fyra
    // timmars svetsning, utan att någon ändrat ordern.
    await place();

    const result = await saveStation(db, companyId, {
      stationId: fras1,
      name: "Fräs 1",
      momentId: svetsning,
      days: [],
    });

    expect(result.error).toMatch(/kan inte byta arbetsmoment/);
  });

  it("låter en station utan rutor byta arbetsmoment", async () => {
    const result = await saveStation(db, companyId, {
      stationId: fras1,
      name: "Fräs 1",
      momentId: svetsning,
      days: [],
    });

    expect(result.error).toBeUndefined();

    const station = await db.station.findFirst({ where: { id: fras1 } });
    expect(station?.momentId).toBe(svetsning);
  });

  it("skriver om dagarna i stället för att lägga till dem", async () => {
    // En omskrivning får inte lämna kvar en dag som tagits bort i rutan.
    await saveStation(db, companyId, {
      stationId: fras1,
      name: "Fräs 1",
      momentId: frasning,
      days: [
        { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60, breaks: [] },
      ],
    });

    const station = (await stationsFor(db, SE)).find(
      (item) => item.id === fras1
    )!;

    expect(station.hours).toHaveLength(1);
    expect(station.hours[0].weekday).toBe(1);
    expect(station.hours[0].endMinute).toBe(12 * 60);
  });

  it("vägrar stänga en station med planerad tid framför sig", async () => {
    // Tavlan visar bara öppna stationer, och rutorna hade försvunnit ur vyn
    // utan att försvinna ur databasen.
    await placeBlock(db, companyId, SE, {
      stationId: fras1,
      orderId,
      momentId: frasning,
      // Ett år framåt, så att testet inte beror på vilken dag det körs.
      startsAt: new Date(Date.now() + 365 * 86_400_000),
      minutes: 60,
      byEmail: "admin@example.com",
    });

    const result = await setStationActive(db, SE, fras1, false);

    expect(result.error).toMatch(/planerade jobb/);

    const station = await db.station.findFirst({ where: { id: fras1 } });
    expect(station?.active).toBe(true);
  });

  it("låter en station med bara GAMLA rutor stängas", async () => {
    // Äldre rutor är historik och hindrar ingenting.
    await unsafeGlobalPrisma.plannedBlock.create({
      data: {
        companyId,
        stationId: fras1,
        orderId,
        momentId: frasning,
        startsAt: new Date(Date.now() - 365 * 86_400_000),
        minutes: 60,
        createdByEmail: "admin@example.com",
      },
    });

    expect((await setStationActive(db, SE, fras1, false)).error).toBeUndefined();

    const station = await db.station.findFirst({ where: { id: fras1 } });
    expect(station?.active).toBe(false);
  });

  it("en stängd station tar inte emot nya rutor", async () => {
    await setStationActive(db, SE, fras1, false);

    expect((await place()).error).toMatch(/avstängd/);
  });

  it("att stänga raderar inte stationen", async () => {
    // Stänga ar "inte just nu". Att ta bort ar nagot annat, se nedan.
    await setStationActive(db, SE, fras1, false);

    const station = await db.station.findFirst({ where: { id: fras1 } });

    expect(station).not.toBeNull();
    expect(station?.active).toBe(false);
  });

  it("ordningen går att ändra med pilarna", async () => {
    const before = (await stationsFor(db, SE)).map((item) => item.name);
    expect(before).toEqual(["Fräs 1", "Fräs 2", "Svetsbås"]);

    await moveStation(db, fras2, "up");

    const after = (await stationsFor(db, SE)).map((item) => item.name);
    expect(after).toEqual(["Fräs 2", "Fräs 1", "Svetsbås"]);
  });

  it("pilen gör ingenting på första och sista raden", async () => {
    await moveStation(db, fras1, "up");
    await moveStation(db, svetsbas, "down");

    const names = (await stationsFor(db, SE)).map((item) => item.name);
    expect(names).toEqual(["Fräs 1", "Fräs 2", "Svetsbås"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("ta bort en station", () => {
  /**
   * ATT TA BORT OCH ATT STÄNGA ÄR OLIKA SAKER.
   *
   * Stänga är "maskinen finns men ska inte planeras på just nu". Ta bort är
   * "den här stationen skulle aldrig ha funnits": ett felstavat namn, ett
   * moment man ångrat, en maskin som aldrig köptes.
   *
   * Att radering tillåts alls är en skillnad mot ordrar och arbetsmoment, som
   * bara stängs. De bär registrerad tid, alltså underlag för en faktura och en
   * lön. En station bär PLANER, och en plan som visade sig vara fel ska gå att
   * ta bort.
   */
  it("tar bort stationen", async () => {
    const result = await deleteStation(db, fras1);

    expect(result.error).toBeUndefined();
    expect(await db.station.findFirst({ where: { id: fras1 } })).toBeNull();
  });

  it("tar med sig rutorna och säger hur många", async () => {
    await place({ startsAt: at(8), minutes: 120 });
    await place({ startsAt: at(13), minutes: 60 });

    const result = await deleteStation(db, fras1);

    expect(result.removedBlocks).toBe(2);
    expect(await db.plannedBlock.count({ where: { stationId: fras1 } })).toBe(0);
  });

  it("TIDEN GÅR TILLBAKA TILL OPLACERAT", async () => {
    // Det avgörande. Rutorna försvinner, men minuterna gör det inte: den
    // oplacerade tiden härleds ur beräkningen minus det som ligger ute, så
    // de dyker upp igen av sig själva. Samma egenskap som gör att en krympt
    // ruta lämnar tillbaka sin tid.
    await place({ minutes: 240 });

    const during = (await unplacedWork(db)).find(
      (row) => row.momentId === frasning
    )!;
    expect(during.remainingMinutes).toBe(120);

    await deleteStation(db, fras1);

    const after = (await unplacedWork(db)).find(
      (row) => row.momentId === frasning
    )!;

    expect(after.placedMinutes).toBe(0);
    expect(after.remainingMinutes).toBe(360);
  });

  it("rör inte rutor på ANDRA stationer", async () => {
    await place({ stationId: fras1, minutes: 60 });
    await place({ stationId: fras2, minutes: 60 });

    await deleteStation(db, fras1);

    expect(await db.plannedBlock.count({ where: { stationId: fras2 } })).toBe(1);
  });

  it("en annan kunds station går inte att ta bort", async () => {
    const result = await deleteStation(db, theirStationId);

    expect(result.error).toMatch(/finns inte/);

    const still = await unsafeGlobalPrisma.station.findUnique({
      where: { id: theirStationId },
    });
    expect(still).not.toBeNull();
  });
});
