import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, type CompanyDb } from "@/lib/tenant";
import {
  ownScheduleDays,
  parseMinuteOfDay,
  plannedMinutesForDay,
  readScheduleDays,
  saveOwnScheduleDays,
  schedulesForEmployees,
} from "@/lib/schedule";

/**
 * EGNA ARBETSTIDER PER ANSTÄLLD.
 *
 * De flesta i en verkstad går på företagets schema. Den som inte gör det ska
 * mätas mot sina egna tider, annars visar flexsaldot fel varje vecka utan att
 * någon kan peka på varför.
 *
 * Lagras som ett vanligt schema som bara en person är kopplad till, så att
 * beräkningen inte behövde veta att det finns två sorter.
 */

const TZ = "Europe/Stockholm";
const t = (value: string) => parseMinuteOfDay(value)!;

let companyId: string;
let db: CompanyDb;
let anna: string;
let bertil: string;

/** Ett formulär som rutan under Anställda skulle ha skickat. */
function form(
  days: { weekday: number; start: string; end: string; breaks?: [string, string][] }[]
): FormData {
  const data = new FormData();

  for (const day of days) {
    data.set(`active-${day.weekday}`, "on");
    data.set(`start-${day.weekday}`, day.start);
    data.set(`end-${day.weekday}`, day.end);

    for (const [start, end] of day.breaks ?? []) {
      data.append(`break-start-${day.weekday}`, start);
      data.append(`break-end-${day.weekday}`, end);
    }
  }

  return data;
}

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: "Schematest AB", timezone: TZ },
  });
  companyId = company.id;
  db = forCompany(companyId);

  // Företagets standard: måndag 07:00–16:00 med en timmes lunch, alltså 8 tim.
  await unsafeGlobalPrisma.workSchedule.create({
    data: {
      companyId,
      name: "Normal",
      isDefault: true,
      days: {
        create: [
          {
            companyId,
            weekday: 1,
            startMinute: t("07:00"),
            endMinute: t("16:00"),
            breaks: {
              create: [
                { companyId, startMinute: t("12:00"), endMinute: t("13:00") },
              ],
            },
          },
        ],
      },
    },
  });

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson" },
    })
  ).id;

  bertil = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Bertil Bergqvist" },
    })
  ).id;
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.$disconnect();
});

describe("formuläret läses likadant för företaget och för personen", () => {
  it("en dag med rast blir netto", () => {
    const read = readScheduleDays(
      form([{ weekday: 1, start: "06:30", end: "16:00", breaks: [["12:00", "12:40"]] }])
    );

    expect("days" in read).toBe(true);
    if (!("days" in read)) return;

    expect(read.days).toHaveLength(1);
    expect(read.days[0].breaks).toEqual([
      { startMinute: t("12:00"), endMinute: t("12:40") },
    ]);
  });

  it("ett tomt formulär ger noll dagar och inget fel", () => {
    const read = readScheduleDays(new FormData());

    expect(read).toEqual({ days: [] });
  });

  it("en sluttid före starttiden avvisas", () => {
    const read = readScheduleDays(
      form([{ weekday: 1, start: "16:00", end: "06:30" }])
    );

    expect("error" in read).toBe(true);
  });

  it("raster längre än dagen avvisas", () => {
    const read = readScheduleDays(
      form([
        {
          weekday: 1,
          start: "08:00",
          end: "12:00",
          breaks: [["08:00", "12:00"]],
        },
      ])
    );

    expect("error" in read).toBe(true);
  });
});

describe("egna tider gäller före företagets", () => {
  it("utan egna tider gäller standardschemat", async () => {
    const schedules = await schedulesForEmployees(db, [anna]);

    expect(plannedMinutesForDay(schedules.get(anna) ?? null, 1)).toBe(8 * 60);
  });

  it("med egna tider mäts personen mot dem", async () => {
    // Anna går kortare dag: 07:00–13:00 utan rast, alltså 6 timmar.
    await saveOwnScheduleDays(db, companyId, anna, [
      {
        weekday: 1,
        startMinute: t("07:00"),
        endMinute: t("13:00"),
        breaks: [],
      },
    ]);

    const schedules = await schedulesForEmployees(db, [anna, bertil]);

    expect(plannedMinutesForDay(schedules.get(anna) ?? null, 1)).toBe(6 * 60);
    // Bertil rördes inte.
    expect(plannedMinutesForDay(schedules.get(bertil) ?? null, 1)).toBe(8 * 60);
  });

  it("tiderna läses tillbaka till rutan", async () => {
    const days = await ownScheduleDays(db, [anna, bertil]);

    expect(days.get(anna)).toHaveLength(1);
    expect(days.get(anna)?.[0].startMinute).toBe(t("07:00"));
    // Standardschemat är inte Bertils egna tider.
    expect(days.has(bertil)).toBe(false);
  });

  it("att spara igen ersätter dagarna i stället för att lägga till", async () => {
    await saveOwnScheduleDays(db, companyId, anna, [
      {
        weekday: 2,
        startMinute: t("08:00"),
        endMinute: t("16:00"),
        breaks: [{ startMinute: t("12:00"), endMinute: t("12:30") }],
      },
    ]);

    const days = await ownScheduleDays(db, [anna]);

    expect(days.get(anna)).toHaveLength(1);
    expect(days.get(anna)?.[0].weekday).toBe(2);
  });

  it("utan dagar raderas det egna schemat och standarden gäller igen", async () => {
    await saveOwnScheduleDays(db, companyId, anna, []);

    const [schedules, days, personal] = await Promise.all([
      schedulesForEmployees(db, [anna]),
      ownScheduleDays(db, [anna]),
      db.workSchedule.count({ where: { isDefault: false } }),
    ]);

    expect(plannedMinutesForDay(schedules.get(anna) ?? null, 1)).toBe(8 * 60);
    expect(days.has(anna)).toBe(false);
    // Raden ÄR tillståndet: inget tomt schema lämnas kvar.
    expect(personal).toBe(0);
  });

  it("företagets standardschema rörs aldrig", async () => {
    const standard = await db.workSchedule.findFirst({
      where: { isDefault: true },
      select: { days: { select: { weekday: true } } },
    });

    expect(standard?.days).toHaveLength(1);
  });
});

describe("en annan kunds anställd går inte att röra", () => {
  it("skriver ingenting när personen hör till ett annat företag", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Schematest Grannen AB", timezone: TZ },
    });

    const theirs = await unsafeGlobalPrisma.employee.create({
      data: { companyId: other.id, name: "Grannens Greta" },
    });

    await saveOwnScheduleDays(db, companyId, theirs.id, [
      {
        weekday: 1,
        startMinute: t("07:00"),
        endMinute: t("13:00"),
        breaks: [],
      },
    ]);

    const after = await unsafeGlobalPrisma.employee.findUnique({
      where: { id: theirs.id },
      select: { scheduleId: true },
    });

    expect(after?.scheduleId).toBeNull();
    expect(
      await unsafeGlobalPrisma.workSchedule.count({
        where: { companyId: other.id },
      })
    ).toBe(0);

    await unsafeGlobalPrisma.company.delete({ where: { id: other.id } });
  });
});
