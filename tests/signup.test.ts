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
    ownerName: "Agneta Ägare",
    email: `agare-${unique}@example.com`,
    phone: "070-123 45 67",
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
    ownerName: "Agneta Ägare",
    email: "chef@mekaniska.se",
    phone: "070-123 45 67",
    password: "ett-langt-losenord",
  };

  it("kräver ägarens namn", () => {
    expect(validateSignup({ ...base, ownerName: " " })).toBeTruthy();
  });

  it("kräver ett telefonnummer som går att tolka", () => {
    expect(validateSignup({ ...base, phone: "" })).toBeTruthy();
    expect(validateSignup({ ...base, phone: "070-12" })).toBeTruthy();
  });

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

  it("de rekommenderade stegen avgör inte om guiden är klar", async () => {
    // Kundregister, timkostnader och improduktiv tid gör underlagen
    // kompletta, men man kan stämpla utan dem. Räknades de in skulle en kund
    // som inte vill ha ett kundregister aldrig bli klar.
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
    expect(state.total).toBe(4);
    expect(state.extras.every((step) => step.done)).toBe(false);
  });

  it("arbetstidsschemat är ett steg bara för den som har löneunderlaget", async () => {
    const { company } = await signup();
    const db = forCompany(company.id);

    const utan = await getOnboardingState(db);
    const med = await getOnboardingState(db, { payroll: true });

    expect(utan.extras.some((step) => step.key === "schedule")).toBe(false);
    expect(med.extras.some((step) => step.key === "schedule")).toBe(true);
  });
});

describe("ägarens kontaktuppgifter", () => {
  it("namn och telefon sparas på ägaren, telefonen normaliserad", async () => {
    const { owner } = await signup({
      ownerName: "  Agneta Ägare ",
      phone: "070-123 45 67",
    });

    const saved = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: owner.id },
      select: { name: true, phone: true, role: true },
    });

    expect(saved.name).toBe("Agneta Ägare");
    expect(saved.phone).toBe("+46701234567");
    expect(saved.role).toBe("OWNER");
  });

  it("ett nummer som inte går att tolka stoppar registreringen", async () => {
    await expect(signup({ phone: "ring mig" })).rejects.toThrow(SignupError);
  });
});
