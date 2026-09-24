import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { buildWeek, isoWeekNumber } from "@/lib/week";
import { startOfWeekIn, wallTimeIn } from "@/lib/time-zone";

/**
 * Veckovyn.
 *
 * Två saker som är lätta att få fel och svåra att upptäcka: vilken dag en vecka
 * börjar på, och vilken dag en post hamnar på när skiftet passerar midnatt. Är
 * någon av dem fel ser veckan rimlig ut men visar fel person fel dag.
 *
 * ALLA TIDPUNKTER SKRIVS MED Z, alltså i UTC, och alla kontroller görs mot
 * svensk väggklocka. Testerna körs i en container som går på UTC medan
 * verkstaden går på svensk tid — skrevs tiderna utan tidszon skulle testerna
 * säga att allt stämmer så länge de två råkar vara samma, vilket de är halva
 * dygnet. Det är den buggen den här filen finns för att fånga.
 */

const SE = "Europe/Stockholm";

let companyId: string;
let unique: string;
let employeeId: string;
let orderId: string;
let momentId: string;

beforeEach(async () => {
  unique = Math.random().toString(36).slice(2, 10);

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Veckotest ${unique}` },
  });
  companyId = company.id;

  const [employee, order, moment] = await Promise.all([
    unsafeGlobalPrisma.employee.create({
      data: { companyId, name: `Anna ${unique}` },
    }),
    unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: `O-${unique}` },
    }),
    unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: `Svetsning ${unique}` },
    }),
  ]);

  employeeId = employee.id;
  orderId = order.id;
  momentId = moment.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Veckotest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

async function punch(from: string, to: string, needsReview = false) {
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId,
      orderId,
      momentId,
      clockInAt: new Date(from),
      clockOutAt: new Date(to),
      needsReview,
    },
  });
}

describe("veckans början", () => {
  it("veckan börjar på måndag", () => {
    // Onsdag 12 augusti 2026 hör till veckan som börjar måndag den 10:e.
    const monday = startOfWeekIn(new Date("2026-08-12T13:00:00Z"), SE);
    const wall = wallTimeIn(monday, SE);

    expect(wall.day).toBe(10);
    expect(wall.hour).toBe(0);
  });

  it("söndagen hör till veckan som varit, inte den som kommer", () => {
    // Den vanligaste tabben: getDay() ger 0 för söndag, och en naiv uträkning
    // flyttar då söndagen till nästa vecka.
    const monday = startOfWeekIn(new Date("2026-08-16T18:00:00Z"), SE);

    expect(wallTimeIn(monday, SE).day).toBe(10);
  });

  it("söndag kväll hamnar inte i veckan efter", () => {
    // 22:00 svensk tid en söndag är 20:00 UTC — men 23:00 svensk tid är
    // 21:00 UTC, och midnatt svensk tid är 22:00 UTC. Räknas veckan i UTC
    // flyttas hela söndagskvällen till måndagen, alltså till nästa vecka.
    const sundayEvening = new Date("2026-08-16T22:30:00Z"); // 00:30 måndag SE
    const lateSunday = new Date("2026-08-16T21:00:00Z"); // 23:00 söndag SE

    expect(wallTimeIn(startOfWeekIn(lateSunday, SE), SE).day).toBe(10);
    // Efter midnatt på väggen är det däremot en ny vecka.
    expect(wallTimeIn(startOfWeekIn(sundayEvening, SE), SE).day).toBe(17);
  });
});

describe("veckonummer", () => {
  it("räknas enligt ISO", () => {
    expect(isoWeekNumber(new Date("2026-01-05T12:00:00Z"), SE)).toBe(2);
    expect(isoWeekNumber(new Date("2026-08-12T12:00:00Z"), SE)).toBe(33);
  });

  it("räknas på väggklockan och inte på UTC", () => {
    // 00:30 svensk tid måndag den 5 januari är 23:30 UTC söndag den 4:e.
    // Räknat i UTC blir det vecka 1, på väggen vecka 2.
    expect(isoWeekNumber(new Date("2026-01-04T23:30:00Z"), SE)).toBe(2);
  });
});

describe("tid per dag", () => {
  it("summerar per person och dag", async () => {
    await punch("2026-08-10T07:00:00Z", "2026-08-10T11:00:00Z");
    await punch("2026-08-10T12:00:00Z", "2026-08-10T15:00:00Z");
    await punch("2026-08-12T08:00:00Z", "2026-08-12T10:00:00Z");

    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-08-12T00:00:00Z"),
      SE
    );

    const row = week.rows.find((item) => item.employeeId === employeeId);

    expect(row?.days[0].minutes).toBe(7 * 60);
    expect(row?.days[1].minutes).toBe(0);
    expect(row?.days[2].minutes).toBe(2 * 60);
    expect(row?.totalMinutes).toBe(9 * 60);
  });

  it("ett skift över midnatt räknas på dagen det började", async () => {
    // Tisdag 22:00 till onsdag 02:00 SVENSK TID, alltså 20:00–00:00 UTC.
    // Den som läser tänker på tisdagen.
    await punch("2026-08-11T20:00:00Z", "2026-08-12T00:00:00Z");

    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-08-12T00:00:00Z"),
      SE
    );

    const row = week.rows.find((item) => item.employeeId === employeeId);

    expect(row?.days[1].minutes).toBe(4 * 60);
    expect(row?.days[2].minutes).toBe(0);
  });

  it("en dag med ogranskad post markeras", async () => {
    await punch("2026-08-13T07:00:00Z", "2026-08-13T18:00:00Z", true);

    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-08-12T00:00:00Z"),
      SE
    );

    const row = week.rows.find((item) => item.employeeId === employeeId);

    expect(row?.days[3].needsReview).toBe(true);
    expect(row?.days[0].needsReview).toBe(false);
  });

  it("dagssummorna stämmer med radernas", async () => {
    await punch("2026-08-10T08:00:00Z", "2026-08-10T16:00:00Z");

    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-08-12T00:00:00Z"),
      SE
    );

    expect(week.dayTotals[0]).toBe(8 * 60);
    expect(week.totalMinutes).toBe(8 * 60);
  });

  it("tid utanför veckan räknas inte med", async () => {
    // Söndagen veckan innan, och måndagen veckan efter.
    await punch("2026-08-09T08:00:00Z", "2026-08-09T16:00:00Z");
    await punch("2026-08-17T08:00:00Z", "2026-08-17T16:00:00Z");

    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-08-12T00:00:00Z"),
      SE
    );

    expect(week.totalMinutes).toBe(0);
  });
});

describe("veckorna då klockan ställs om", () => {
  /**
   * Två gånger om året är ett dygn inte 24 timmar. Sista söndagen i oktober är
   * 25 timmar lång, sista i mars 23. Räknas veckan som sju gånger 86 400 000
   * millisekunder glider gränsen en timme, och just de veckorna tappar eller
   * dubblerar en timme i kanten — vilket ser ut som ett räknefel i systemet.
   */

  const HOUR = 60 * 60 * 1000;

  it("oktoberveckan är 169 timmar lång", async () => {
    // Söndag 25 oktober 2026 ställs klockan tillbaka. Veckan får en timme.
    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-10-21T12:00:00Z"),
      SE
    );

    expect(week.from.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    // to är sista millisekunden av söndagen, alltså nästa måndag minus ett.
    expect(week.to.getTime() - week.from.getTime()).toBe(169 * HOUR - 1);
  });

  it("marsveckan är 167 timmar lång", async () => {
    // Söndag 29 mars 2026 ställs klockan fram. Veckan blir en timme kortare.
    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-03-25T12:00:00Z"),
      SE
    );

    expect(week.from.toISOString()).toBe("2026-03-22T23:00:00.000Z");
    expect(week.to.getTime() - week.from.getTime()).toBe(167 * HOUR - 1);
  });

  it("söndagens sista timme hör till veckan", async () => {
    // 23:00 svensk tid söndagen efter omställningen är 22:00 UTC. En naiv
    // uträkning lägger veckans slut där och tappar passet.
    await punch("2026-10-25T22:00:00Z", "2026-10-25T22:30:00Z");

    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-10-21T12:00:00Z"),
      SE
    );
    const row = week.rows.find((item) => item.employeeId === employeeId);

    expect(row?.days[6].minutes).toBe(30);
    expect(week.totalMinutes).toBe(30);
  });

  it("måndagens första timme hör till veckan efter", async () => {
    // 00:30 svensk tid måndag är 23:30 UTC söndag. Den ska INTE räknas in.
    await punch("2026-10-25T23:30:00Z", "2026-10-26T00:00:00Z");

    const week = await buildWeek(
      forCompany(companyId),
      new Date("2026-10-21T12:00:00Z"),
      SE
    );

    expect(week.totalMinutes).toBe(0);
  });
});

describe("parallella jobb räknas en gång", () => {
  let fräsning: string;

  beforeEach(async () => {
    // Ett andra arbetsmoment, alltså en andra maskin. Två överlappande pass på
    // SAMMA moment kan inte uppstå — clock.ts vägrar det — så testdatan ska
    // inte se ut så heller.
    fräsning = (
      await unsafeGlobalPrisma.workMoment.create({
        data: { companyId, name: `Fräsning ${unique}` },
      })
    ).id;
  });

  const onFräsning = async (from: string, to: string) => {
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId,
        orderId,
        momentId: fräsning,
        clockInAt: new Date(from),
        clockOutAt: new Date(to),
      },
    });
  };

  const monday = () =>
    buildWeek(forCompany(companyId), new Date("2026-08-03T12:00:00Z"), SE);

  it("två maskiner som överlappar ger tid i arbete, inte summan", async () => {
    // Svets 08–12 och fräs 11–15. Personen var i arbete 08–15 = sju timmar.
    // Rapporten säger nio, och det är också rätt — men på en annan fråga.
    await punch("2026-08-03T06:00:00Z", "2026-08-03T10:00:00Z");
    await onFräsning("2026-08-03T09:00:00Z", "2026-08-03T13:00:00Z");

    const day = (await monday()).rows[0].days[0];

    expect(day.minutes).toBe(7 * 60);
    expect(day.parallelMinutes).toBe(60);
  });

  it("ett jobb helt inuti ett annat lägger ingenting till", async () => {
    await punch("2026-08-03T06:00:00Z", "2026-08-03T14:00:00Z");
    await onFräsning("2026-08-03T08:00:00Z", "2026-08-03T09:00:00Z");

    const day = (await monday()).rows[0].days[0];

    expect(day.minutes).toBe(8 * 60);
    expect(day.parallelMinutes).toBe(60);
  });

  it("jobb som inte överlappar räknas som förut", async () => {
    await punch("2026-08-03T06:00:00Z", "2026-08-03T10:00:00Z");
    await onFräsning("2026-08-03T11:00:00Z", "2026-08-03T13:00:00Z");

    const day = (await monday()).rows[0].days[0];

    expect(day.minutes).toBe(6 * 60);
    expect(day.parallelMinutes).toBe(0);
  });

  it("kant i kant räknas inte som parallellt", async () => {
    await punch("2026-08-03T06:00:00Z", "2026-08-03T10:00:00Z");
    await onFräsning("2026-08-03T10:00:00Z", "2026-08-03T12:00:00Z");

    const day = (await monday()).rows[0].days[0];

    expect(day.minutes).toBe(6 * 60);
    expect(day.parallelMinutes).toBe(0);
  });

  it("veckans summa följer den sammanslagna tiden", async () => {
    await punch("2026-08-03T06:00:00Z", "2026-08-03T10:00:00Z");
    await onFräsning("2026-08-03T09:00:00Z", "2026-08-03T13:00:00Z");

    const week = await monday();

    expect(week.rows[0].totalMinutes).toBe(7 * 60);
    expect(week.dayTotals[0]).toBe(7 * 60);
    expect(week.totalMinutes).toBe(7 * 60);
  });
});
