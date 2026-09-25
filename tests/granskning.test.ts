import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";

/**
 * GRANSKNING AV POSTER SYSTEMET RÄKNAT FRAM SLUTTIDEN PÅ.
 *
 * Ett fält och en knapp, två utfall. Servern jämför tiden i fältet med den som
 * står på posten:
 *
 *   Orörd tid  → godkänd. `source` förblir AUTO_CLOSE.
 *   Ändrad tid → rättad. `source` blir ADMIN_MANUAL.
 *
 * Varför det är värt ett test: skillnaden mellan de två är hela spåret. En tid
 * någon skrivit in ska aldrig gå att förväxla med en riktig stämpling, och gick
 * grenen fel skulle varje godkännande se ut som en handpåläggning — eller
 * tvärtom, en rättad tid se ut som systemets egen. Ingetdera syns på skärmen;
 * det syns först i en diskussion om en faktura.
 *
 * Jämförelsen sker på MINUTEN, eftersom datumfältet inte har sekunder.
 */

let companyId: string;
let email = "admin@demo.se";

// Mockas för att åtgärden är en server action. Den vill ha en inloggad
// administratör och Next:s cache; här räcker ett företag och en tom funktion.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Hela modulen ersätts, inte bara requireAdmin. Att importera originalet hade
// dragit in support-session.ts, som läser cookies och kräver en pågående
// förfrågan — den finns inte här.
//
// assertWritable måste därför finnas med, och den måste bete sig som den
// riktiga: en mock som alltid släpper igenom hade gjort testet blint för att
// vakten togs bort ur åtgärden.
vi.mock("@/lib/admin-session", () => ({
  requireAdmin: async () => ({
    userId: "test-admin",
    email,
    companyId,
    companyName: "Granskningstest AB",
    role: "OWNER",
    db: forCompany(companyId),
    support: undefined,
  }),
  assertWritable: (session: { support?: unknown }) => {
    if (session.support) throw new Error("Supportläget får bara läsa.");
  },
}));

const { reviewEntry } = await import("@/app/admin/(panel)/granskning/actions");

let employeeId: string;
let orderId: string;
let momentId: string;
let entryId: string;

/** Instämplad 07:00 svensk tid, automatiskt stängd 18:00 samma dag. */
const CLOCK_IN = new Date("2026-09-21T05:00:00Z");
const AUTO_CLOSED = new Date("2026-09-21T16:00:00Z");

beforeEach(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: {
      name: `Granskningstest ${Math.random().toString(36).slice(2, 8)}`,
      autoCloseAt: "18:00",
      timezone: "Europe/Stockholm",
    },
  });
  companyId = company.id;
  email = "admin@demo.se";

  const [employee, order, moment] = await Promise.all([
    unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson" },
    }),
    unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2601" },
    }),
    unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    }),
  ]);

  employeeId = employee.id;
  orderId = order.id;
  momentId = moment.id;

  entryId = (
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId,
        orderId,
        momentId,
        clockInAt: CLOCK_IN,
        clockOutAt: AUTO_CLOSED,
        source: "AUTO_CLOSE",
        needsReview: true,
        reviewNote: "Automatiskt utstämplad 18:00 — ingen utstämpling.",
      },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Granskningstest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

/** Skickar formuläret med angiven sluttid, som fältet skriver den. */
async function submit(clockOutAt: string, id = entryId) {
  const form = new FormData();
  form.set("id", id);
  form.set("clockOutAt", clockOutAt);
  await reviewEntry(form);
}

const saved = () =>
  unsafeGlobalPrisma.timeEntry.findUniqueOrThrow({ where: { id: entryId } });

describe("orörd tid godkänns", () => {
  it("behåller AUTO_CLOSE och släcker flaggan", async () => {
    // Samma tid som står på posten: 18:00 svensk tid.
    await submit("2026-09-21T18:00");

    const entry = await saved();

    expect(entry.needsReview).toBe(false);
    // Det här är kärnan: posten är fortfarande systemets tid, nu bekräftad.
    // Blev den ADMIN_MANUAL vore spåret borta.
    expect(entry.source).toBe("AUTO_CLOSE");
    expect(entry.clockOutAt?.toISOString()).toBe(AUTO_CLOSED.toISOString());
    expect(entry.reviewNote).toContain("godkänd av admin@demo.se");
  });

  it("bryr sig inte om sekunder på den sparade tiden", async () => {
    // En post vars sluttid har sekunder i sig — t.ex. rättad någon gång förut.
    // Fältet kan inte skicka sekunder, så en jämförelse på millisekunden hade
    // läst varje godkännande som en ändring.
    await unsafeGlobalPrisma.timeEntry.update({
      where: { id: entryId },
      data: { clockOutAt: new Date("2026-09-21T16:00:42Z") },
    });

    await submit("2026-09-21T18:00");

    expect((await saved()).source).toBe("AUTO_CLOSE");
  });
});

describe("ändrad tid rättas", () => {
  it("sparar den nya tiden och märker posten manuell", async () => {
    // Anna gick hem 16:30, inte 18:00.
    await submit("2026-09-21T16:30");

    const entry = await saved();

    expect(entry.needsReview).toBe(false);
    expect(entry.source).toBe("ADMIN_MANUAL");
    expect(entry.clockOutAt?.toISOString()).toBe("2026-09-21T14:30:00.000Z");
    expect(entry.reviewNote).toContain("Rättad av admin@demo.se");
  });

  it("en minuts skillnad räknas som en ändring", async () => {
    await submit("2026-09-21T18:01");

    expect((await saved()).source).toBe("ADMIN_MANUAL");
  });

  it("tolkar tiden i företagets tidszon, inte serverns", async () => {
    // 16:30 svensk tid i september är 14:30 UTC. Räknades fältet i serverns
    // tidszon skulle posten hamna två timmar fel — och testerna körs i en
    // container som går på UTC, alltså just det läget.
    await submit("2026-09-21T16:30");

    expect((await saved()).clockOutAt?.getUTCHours()).toBe(14);
  });
});

describe("orimligt avvisas", () => {
  it("en sluttid före starttiden ändrar ingenting", async () => {
    // 06:00 svensk tid, alltså före instämplingen 07:00. En negativ arbetsdag.
    await submit("2026-09-21T06:00");

    const entry = await saved();

    expect(entry.needsReview).toBe(true);
    expect(entry.clockOutAt?.toISOString()).toBe(AUTO_CLOSED.toISOString());
  });

  it("ett tomt fält ändrar ingenting", async () => {
    await submit("");

    expect((await saved()).needsReview).toBe(true);
  });

  it("skräp i fältet ändrar ingenting", async () => {
    await submit("i eftermiddags");

    expect((await saved()).needsReview).toBe(true);
  });

  it("en post hos ett annat företag går inte att röra", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Granskningstest annat företag" },
    });
    // Hela uppsättningen, inte bara en lös post: en ORDER-stämpling utan order
    // och moment är ett läge clock.ts vägrar skapa, och testdata ska inte se ut
    // på ett sätt produktionen inte tillåter.
    const [outsider, otherOrder, otherMoment] = await Promise.all([
      unsafeGlobalPrisma.employee.create({
        data: { companyId: other.id, name: "Erik Ek" },
      }),
      unsafeGlobalPrisma.order.create({
        data: { companyId: other.id, orderNumber: "9001" },
      }),
      unsafeGlobalPrisma.workMoment.create({
        data: { companyId: other.id, name: "Svarvning" },
      }),
    ]);

    const foreign = await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId: other.id,
        employeeId: outsider.id,
        kind: "ORDER",
        orderId: otherOrder.id,
        momentId: otherMoment.id,
        clockInAt: CLOCK_IN,
        clockOutAt: AUTO_CLOSED,
        source: "AUTO_CLOSE",
        needsReview: true,
      },
    });

    // Id:t kommer från ett formulär och får aldrig peka på en annan kunds post.
    await submit("2026-09-21T16:30", foreign.id);

    const untouched = await unsafeGlobalPrisma.timeEntry.findUniqueOrThrow({
      where: { id: foreign.id },
    });

    expect(untouched.needsReview).toBe(true);
    expect(untouched.source).toBe("AUTO_CLOSE");
  });
});
