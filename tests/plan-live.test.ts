import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, type CompanyDb } from "@/lib/tenant";
import { progressFor, type LiveBlock } from "@/lib/plan-live";
import type { StationHours } from "@/lib/plan-calendar";

/**
 * UTFALLET MOT PLANEN.
 *
 * Tavlan ska visa att ett planerat jobb KÖRS. Reglerna för hur en stämpling
 * tillskrivs en ruta är inte självklara, och en av dem är öppet förenklad —
 * därför ska de vara fastspikade i ett test och inte råka stämma.
 *
 * Den förenklade: en stämpling bär order och arbetsmoment men INTE station.
 * Kiosken känner inga stationer, och ska inte göra det. Ligger två rutor för
 * samma order och moment samtidigt på olika stationer räknas samma minuter på
 * båda. Siffran svarar på om jobbet körs, inte på hur mycket som ska
 * faktureras — den sanna summan finns i rapporterna.
 */

const SE = "Europe/Stockholm";

let companyId: string;
let db: CompanyDb;

let orderId: string;
let otherOrderId: string;
let frasning: string;
let svetsning: string;
let anna: string;
let bjorn: string;

/** Fräsen: öppen 07:00–16:00 med fyrtio minuters lunch. */
const HOURS: StationHours = {
  weekday: 1,
  startMinute: 7 * 60,
  endMinute: 16 * 60,
  breaks: [{ startMinute: 12 * 60, endMinute: 12 * 60 + 40 }],
};

/** Måndag 5 oktober 2026, svensk tid. Oktober är UTC+2. */
function at(hour: number, minute = 0): Date {
  return new Date(
    `2026-10-05T${String(hour - 2).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}:00Z`
  );
}

/** En ruta som utfallet räknas för. Fyra timmar från 08:00 på fräsen. */
function block(options: Partial<LiveBlock> = {}): LiveBlock {
  return {
    id: "block-1",
    orderId,
    momentId: frasning,
    startsAt: at(8),
    minutes: 240,
    hours: HOURS,
    ...options,
  };
}

/** Skriver en stämpling. `to` som null betyder pågående. */
async function punch(options: {
  employeeId?: string;
  orderId?: string;
  momentId?: string;
  from: Date;
  to: Date | null;
}) {
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId: options.employeeId ?? anna,
      kind: "ORDER",
      orderId: options.orderId ?? orderId,
      momentId: options.momentId ?? frasning,
      clockInAt: options.from,
      clockOutAt: options.to,
    },
  });
}

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Utfallstest ${unique}`, timezone: SE },
  });

  companyId = company.id;
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
  otherOrderId = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2615" },
    })
  ).id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson" },
    })
  ).id;
  bjorn = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Björn Bergqvist" },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Utfallstest " } },
  });
});

describe("vad som räknas som utfall på en ruta", () => {
  it("en stämpling inom rutan räknas", async () => {
    await punch({ from: at(8), to: at(10) });

    const result = await progressFor(db, [block()], SE, at(17));

    expect(result.get("block-1")?.clockedMinutes).toBe(120);
    expect(result.get("block-1")?.running).toBe(false);
  });

  it("en stämpling utanför rutan räknas inte", async () => {
    // Rutan är 08:00–12:00 (fyra arbetstimmar, lunchen efter). Ett pass på
    // kvällen hör inte till den.
    await punch({ from: at(18), to: at(20) });

    const result = await progressFor(db, [block()], SE, at(21));

    expect(result.has("block-1")).toBe(false);
  });

  it("bara den del som ligger inom rutan räknas", async () => {
    // Passet börjar en timme före rutan och slutar en timme in i den.
    await punch({ from: at(7), to: at(9) });

    const result = await progressFor(db, [block()], SE, at(17));

    expect(result.get("block-1")?.clockedMinutes).toBe(60);
  });

  it("en annan order räknas inte", async () => {
    await punch({ orderId: otherOrderId, from: at(8), to: at(10) });

    const result = await progressFor(db, [block()], SE, at(17));

    expect(result.has("block-1")).toBe(false);
  });

  it("ett annat arbetsmoment räknas inte", async () => {
    await punch({ momentId: svetsning, from: at(8), to: at(10) });

    const result = await progressFor(db, [block()], SE, at(17));

    expect(result.has("block-1")).toBe(false);
  });

  it("rutans slut räknas med lunchen överhoppad", async () => {
    // Rutan är fyra ARBETSTIMMAR från 08:00 och slutar alltså 12:00, eftersom
    // lunchen börjar då. Ett pass som pågår till 13:00 ska ge 240 minuter och
    // inte 300.
    await punch({ from: at(8), to: at(13) });

    const result = await progressFor(db, [block()], SE, at(17));

    expect(result.get("block-1")?.clockedMinutes).toBe(240);
  });
});

describe("pågår just nu", () => {
  it("en öppen stämpling gör rutan pågående och namnger personen", async () => {
    await punch({ from: at(8), to: null });

    const result = await progressFor(db, [block()], SE, at(10));

    expect(result.get("block-1")?.running).toBe(true);
    expect(result.get("block-1")?.people).toEqual(["Anna Andersson"]);
  });

  it("räknar ett pågående pass fram till nu", async () => {
    await punch({ from: at(8), to: null });

    const result = await progressFor(db, [block()], SE, at(9, 30));

    expect(result.get("block-1")?.clockedMinutes).toBe(90);
  });

  it("flera som är inne namnges i bokstavsordning", async () => {
    // Ordningen skrivs ut med flit. Utan den avgör databasen vilket namn som
    // står först, och det kan skilja mellan två pollningar tio sekunder isär
    // — vilket ser ut som att något händer.
    await punch({ employeeId: bjorn, from: at(8), to: null });
    await punch({ employeeId: anna, from: at(8, 30), to: null });

    const result = await progressFor(db, [block()], SE, at(10));

    expect(result.get("block-1")?.people).toEqual([
      "Anna Andersson",
      "Björn Bergqvist",
    ]);
  });

  it("är pågående även när passet börjat före rutan", async () => {
    // Den som börjat en timme för tidigt arbetar fortfarande på jobbet, och
    // tavlan ska visa det i stället för att se död ut.
    await punch({ from: at(7), to: null });

    const result = await progressFor(db, [block()], SE, at(9));

    expect(result.get("block-1")?.running).toBe(true);
  });

  it("är pågående även efter att rutan tagit slut", async () => {
    // Jobbet tog längre tid än planerat. Det är precis vad planeraren vill se.
    await punch({ from: at(8), to: null });

    const result = await progressFor(db, [block()], SE, at(15));

    expect(result.get("block-1")?.running).toBe(true);
  });
});

describe("rutor utan utfall", () => {
  it("saknas i kartan i stället för att svara noll", async () => {
    // Tavlan visar då "·" och inte "0:00". Ingen tid och noll tid är olika
    // svar, samma hållning som en saknad timkostnad har.
    const result = await progressFor(db, [block()], SE, at(17));

    expect(result.size).toBe(0);
  });

  it("en tom lista rutor ger en tom karta utan att fråga databasen", async () => {
    const result = await progressFor(db, [], SE, at(17));

    expect(result.size).toBe(0);
  });
});

describe("den förenklade regeln, fastspikad", () => {
  it("samma minuter räknas på två rutor för samma order och moment", async () => {
    // ÖPPET FELAKTIGT, OCH ÄNDÅ RÄTT VAL. En stämpling bär ingen station, så
    // Tikkr kan inte veta vid vilken av två fräsar operatören stod. Siffran
    // svarar på om jobbet körs; den sanna summan per order och moment finns i
    // rapporterna, som är stället där varje stämpling syns för sig.
    //
    // Testet finns för att regeln ska vara ett BESLUT. Skulle någon ändra den
    // ska det kräva att den här kommentaren lästes.
    await punch({ from: at(8), to: at(10) });

    const result = await progressFor(
      db,
      [
        block({ id: "fras-1" }),
        block({ id: "fras-2" }),
      ],
      SE,
      at(17)
    );

    expect(result.get("fras-1")?.clockedMinutes).toBe(120);
    expect(result.get("fras-2")?.clockedMinutes).toBe(120);
  });

  it("summerar rått och inte som huvudstämpling", async () => {
    // Tavlan frågar om MASKINEN gick, inte om personen var på jobbet. Kör en
    // operatör två maskiner samtidigt ska båda rutorna visa sin tid — det är
    // samma skillnad som rapporterna och tidrapporten gör.
    await punch({ from: at(8), to: at(10) });
    await punch({
      momentId: svetsning,
      from: at(8),
      to: at(10),
    });

    const result = await progressFor(
      db,
      [
        block({ id: "fras", momentId: frasning }),
        block({ id: "svets", momentId: svetsning }),
      ],
      SE,
      at(17)
    );

    expect(result.get("fras")?.clockedMinutes).toBe(120);
    expect(result.get("svets")?.clockedMinutes).toBe(120);
  });
});

describe("företagsgränsen", () => {
  it("en annan kunds stämpling räknas inte", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: `Utfallstest grannen ${Date.now()}`, timezone: SE },
    });

    const theirEmployee = await unsafeGlobalPrisma.employee.create({
      data: { companyId: other.id, name: "Erik Ek" },
    });
    const theirMoment = await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: other.id, name: "Fräsning" },
    });
    const theirOrder = await unsafeGlobalPrisma.order.create({
      data: { companyId: other.id, orderNumber: "2601" },
    });

    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId: other.id,
        employeeId: theirEmployee.id,
        kind: "ORDER",
        orderId: theirOrder.id,
        momentId: theirMoment.id,
        clockInAt: at(8),
        clockOutAt: at(10),
      },
    });

    // Vår ruta pekar på VÅR order och vårt moment, men grannen har en order
    // med samma nummer och ett moment med samma namn. Id:na skiljer sig, och
    // företagsfiltret ska göra resten.
    const result = await progressFor(db, [block()], SE, at(17));

    expect(result.size).toBe(0);
  });
});
