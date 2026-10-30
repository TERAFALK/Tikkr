import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";

/**
 * ETT NAMN SOM REDAN FINNS ÄR ETT SKRIVFEL, INTE ETT HAVERI.
 *
 * Arbetsmoment, improduktiva moment och rasttyper har unika namn per företag.
 * Åtgärderna fångade inte det, och rutan stängdes när formuläret skickades.
 * Skrev någon Svetsning en gång till byttes hela sidan mot "Något gick fel".
 *
 * Nu svarar åtgärden med ett besked, och rutan står kvar med det man skrivit.
 */

let companyId: string;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Hela modulen ersätts, av samma skäl som i granskning.test.ts.
vi.mock("@/lib/admin-session", () => ({
  requireAdmin: async () => ({
    userId: "test-admin",
    email: "admin@demo.se",
    companyId,
    companyName: "Dubblettest AB",
    role: "OWNER",
    db: forCompany(companyId),
    support: undefined,
  }),
  assertWritable: async () => {},
}));

const { createMoment, renameMoment } = await import(
  "@/app/admin/(panel)/installningar/arbetsmoment/actions"
);
const { createIndirectMoment, renameIndirectMoment } = await import(
  "@/app/admin/(panel)/installningar/improduktivt/actions"
);
const { createBreakType } = await import(
  "@/app/admin/(panel)/installningar/schema/actions"
);

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: {
      name: `Dubblettest ${Math.random().toString(36).slice(2, 8)}`,
      modules: {
        create: { module: "PAYROLL", source: "MANUAL", enabledBy: "test" },
      },
    },
  });
  companyId = company.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Dubblettest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("arbetsmoment", () => {
  it("svarar med ett besked när namnet redan finns", async () => {
    expect((await createMoment({}, form({ name: "Svetsning" }))).ok).toBeTruthy();

    const second = await createMoment({}, form({ name: "Svetsning" }));

    expect(second.error).toContain("redan");
    expect(second.ok).toBeUndefined();
  });

  it("säger till om namnet saknas", async () => {
    expect((await createMoment({}, form({ name: "  " }))).error).toBeTruthy();
  });

  it("ett nytt namn på ett befintligt moment prövas också", async () => {
    await createMoment({}, form({ name: "Svetsning" }));
    await createMoment({}, form({ name: "Fräsning" }));

    const moment = await unsafeGlobalPrisma.workMoment.findFirstOrThrow({
      where: { companyId, name: "Fräsning" },
    });

    const result = await renameMoment(
      {},
      form({ id: moment.id, name: "Svetsning" })
    );

    expect(result.error).toContain("redan");
  });
});

describe("improduktiva moment", () => {
  it("svarar med ett besked när namnet redan finns", async () => {
    await createIndirectMoment({}, form({ name: "Städning" }));

    const second = await createIndirectMoment({}, form({ name: "Städning" }));

    expect(second.error).toContain("redan");
  });

  it("ett nytt namn på ett befintligt moment prövas också", async () => {
    await createIndirectMoment({}, form({ name: "Städning" }));
    await createIndirectMoment({}, form({ name: "Möte" }));

    const moment = await unsafeGlobalPrisma.indirectMoment.findFirstOrThrow({
      where: { companyId, name: "Möte" },
    });

    const result = await renameIndirectMoment(
      {},
      form({ id: moment.id, name: "Städning" })
    );

    expect(result.error).toContain("redan");
  });
});

describe("rasttyper", () => {
  it("svarar med ett besked när namnet redan finns", async () => {
    await createBreakType({}, form({ name: "Lunch" }));

    const second = await createBreakType({}, form({ name: "Lunch" }));

    expect(second.error).toContain("redan");
  });
});
