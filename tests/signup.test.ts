import { describe, it, expect, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { getOnboardingState } from "@/lib/onboarding";
import {
  createCompanyWithOwner,
  normalizeEmail,
  validateSignup,
  SignupError,
} from "@/lib/signup";

/**
 * Registrering av nytt företag.
 *
 * Det viktigaste testet är det sista: en nyregistrerad arbetsyta får inte se
 * någon annans data. Det är hela grunden för att flera kunder ska kunna dela
 * samma installation.
 */

const created: string[] = [];

async function signup(overrides: Partial<Parameters<typeof createCompanyWithOwner>[0]> = {}) {
  const unique = Math.random().toString(36).slice(2, 10);
  const result = await createCompanyWithOwner({
    companyName: `Testbolag ${unique}`,
    email: `agare-${unique}@example.com`,
    password: "ett-langt-losenord",
    ...overrides,
  });

  created.push(result.company.id);
  return result;
}

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { id: { in: created.splice(0) } },
  });
});

describe("kontroll av uppgifter", () => {
  const base = {
    companyName: "Mekaniska AB",
    email: "chef@mekaniska.se",
    password: "ett-langt-losenord",
  };

  it("godkänner rimliga uppgifter", () => {
    expect(validateSignup(base)).toBeNull();
  });

  it("kräver ett företagsnamn", () => {
    expect(validateSignup({ ...base, companyName: " " })).toBeTruthy();
  });

  it("kräver en e-postadress som ser ut som en adress", () => {
    expect(validateSignup({ ...base, email: "inte-en-adress" })).toBeTruthy();
    expect(validateSignup({ ...base, email: "utan@punkt" })).toBeTruthy();
  });

  it("kräver ett lösenord på minst tio tecken", () => {
    expect(validateSignup({ ...base, password: "kort" })).toBeTruthy();
    expect(validateSignup({ ...base, password: "1234567890" })).toBeNull();
  });

  it("e-post normaliseras", () => {
    expect(normalizeEmail("  Chef@Mekaniska.SE ")).toBe("chef@mekaniska.se");
  });
});

describe("skapa arbetsyta", () => {
  it("skapar företag och ägare", async () => {
    const { company, owner } = await signup({ companyName: "Nybygget AB" });

    expect(company.name).toBe("Nybygget AB");
    expect(company.subscriptionStatus).toBe("TRIALING");
    expect(owner.role).toBe("OWNER");
    expect(owner.companyId).toBe(company.id);
  });

  it("lösenordet sparas hashat, aldrig i klartext", async () => {
    const { owner } = await signup({ password: "hemligt-losenord-123" });

    expect(owner.passwordHash).not.toContain("hemligt");
    expect(await bcrypt.compare("hemligt-losenord-123", owner.passwordHash)).toBe(
      true
    );
  });

  it("samma e-postadress kan inte registreras två gånger", async () => {
    const { owner } = await signup();

    await expect(
      signup({ email: owner.email.toUpperCase() })
    ).rejects.toThrow(SignupError);
  });

  it("vägrar för kort lösenord innan något skapas", async () => {
    const before = await unsafeGlobalPrisma.company.count();

    await expect(signup({ password: "kort" })).rejects.toThrow(SignupError);

    expect(await unsafeGlobalPrisma.company.count()).toBe(before);
  });
});

describe("den nya arbetsytan är tom och isolerad", () => {
  it("ser ingenting från ett annat företag", async () => {
    const grannen = await signup({ companyName: "Grannen AB" });
    await unsafeGlobalPrisma.employee.create({
      data: { companyId: grannen.company.id, name: "Grannens Anna" },
    });

    const nykomling = await signup({ companyName: "Nykomlingen AB" });
    const db = forCompany(nykomling.company.id);

    expect(await db.employee.findMany()).toEqual([]);
    expect(await db.order.count()).toBe(0);
    expect(await db.timeEntry.count()).toBe(0);
  });

  it("kom igång-guiden börjar på noll av fyra", async () => {
    const { company } = await signup();
    const state = await getOnboardingState(forCompany(company.id));

    expect(state.completed).toBe(0);
    expect(state.total).toBe(4);
    expect(state.ready).toBe(false);
  });

  it("guiden blir klar när alla fyra delarna finns", async () => {
    const { company } = await signup();
    const companyId = company.id;
    const db = forCompany(companyId);

    await db.employee.create({ data: { companyId, name: "Anna" } });
    await db.workMoment.create({ data: { companyId, name: "Svetsning" } });
    await db.order.create({ data: { companyId, orderNumber: "1" } });
    await db.kioskDevice.create({
      data: { companyId, name: "Verkstaden", tokenHash: `hash-${companyId}` },
    });

    const state = await getOnboardingState(db);
    expect(state.ready).toBe(true);
    expect(state.completed).toBe(4);
  });
});
