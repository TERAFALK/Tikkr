import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { isPlatformAdmin, platformAdminEmails } from "@/lib/platform-access";

// Modulen hör hemma i en webbserver, inte i ett test. Ingen av funktionerna
// som prövas här omdirigerar.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`Oväntad omdirigering till ${to}`);
  },
}));

import {
  deleteCompany,
  PlatformActionError,
  setSubscriptionStatus,
  type SubscriptionStatus,
} from "@/lib/platform-admin";
import { TRIAL_LICENSES } from "@/lib/licenses";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * Behörigheten till plattformspanelen.
 *
 * Den styrs av en miljövariabel och inte av databasen, just för att ingen ska
 * kunna ge sig själv den inifrån appen. Testerna vaktar att listan tolkas
 * strikt — en slarvig jämförelse här vore ett sätt in för fel person.
 */

const original = process.env.PLATFORM_ADMIN_EMAILS;

afterEach(() => {
  process.env.PLATFORM_ADMIN_EMAILS = original;
});

describe("tolkning av listan", () => {
  it("tom lista ger ingen behörighet till någon", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "";

    expect(platformAdminEmails()).toEqual([]);
    expect(isPlatformAdmin("vemsomhelst@example.com")).toBe(false);
  });

  it("saknad variabel ger ingen behörighet", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(isPlatformAdmin("vemsomhelst@example.com")).toBe(false);
  });

  it("flera adresser, mellanslag och versaler hanteras", () => {
    process.env.PLATFORM_ADMIN_EMAILS = " Adi@Terafalk.com , drift@tikkr.se ";

    expect(platformAdminEmails()).toEqual(["adi@terafalk.com", "drift@tikkr.se"]);
    expect(isPlatformAdmin("ADI@terafalk.COM")).toBe(true);
    expect(isPlatformAdmin("drift@tikkr.se")).toBe(true);
  });
});

describe("ingen kommer in av misstag", () => {
  it("adress som inte står med avvisas", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "adi@terafalk.com";
    expect(isPlatformAdmin("annan@terafalk.com")).toBe(false);
  });

  it("delsträngar räcker inte", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "adi@terafalk.com";

    expect(isPlatformAdmin("adi@terafalk.com.angripare.se")).toBe(false);
    expect(isPlatformAdmin("padi@terafalk.com")).toBe(false);
    expect(isPlatformAdmin("adi@terafalk.co")).toBe(false);
  });

  it("tomt eller saknat värde avvisas", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "adi@terafalk.com";

    expect(isPlatformAdmin("")).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
  });
});

/**
 * Manuell statusändring.
 *
 * Två regler att vakta: ett företag som betalar via Stripe får inte ändras
 * här, och ett företag som sätts tillbaka i provperiod ska tillbaka till
 * provperiodens villkor. Utan den andra behöll ett företag sina köpta licenser
 * gratis efter att prenumerationen avslutats.
 */
describe("ändra status från plattformspanelen", () => {
  const actor = "adi@terafalk.com";

  async function company(data: {
    status: SubscriptionStatus;
    licenses: number;
    subscription?: string;
  }) {
    return unsafeGlobalPrisma.company.create({
      data: {
        name: `Platformtest ${Math.random().toString(36).slice(2, 8)}`,
        subscriptionStatus: data.status,
        screenLicenses: data.licenses,
        stripeSubscriptionId: data.subscription ?? null,
      },
    });
  }

  afterEach(async () => {
    await unsafeGlobalPrisma.company.deleteMany({
      where: { name: { startsWith: "Platformtest " } },
    });
    await unsafeGlobalPrisma.platformAuditLog.deleteMany({
      where: { actorEmail: actor },
    });
  });

  afterAll(async () => {
    await unsafeGlobalPrisma.$disconnect();
  });

  it("tillbaka till provperiod återställer antalet licenser", async () => {
    const before = await company({ status: "CANCELED", licenses: 3 });

    await setSubscriptionStatus({
      actorEmail: actor,
      companyId: before.id,
      status: "TRIALING",
      reason: "Förlängd utvärdering",
    });

    const after = await unsafeGlobalPrisma.company.findUnique({
      where: { id: before.id },
      select: { subscriptionStatus: true, screenLicenses: true },
    });

    expect(after?.subscriptionStatus).toBe("TRIALING");
    expect(after?.screenLicenses).toBe(TRIAL_LICENSES);
  });

  it("licenser rörs inte när status sätts till aktiv", async () => {
    // Fakturakund som betalar för fem skärmar utanför Stripe.
    const before = await company({ status: "TRIALING", licenses: 5 });

    await setSubscriptionStatus({
      actorEmail: actor,
      companyId: before.id,
      status: "ACTIVE",
      reason: "Fakturakund",
    });

    const after = await unsafeGlobalPrisma.company.findUnique({
      where: { id: before.id },
      select: { screenLicenses: true },
    });

    expect(after?.screenLicenses).toBe(5);
  });

  it("företag med prenumeration hos Stripe går inte att ändra", async () => {
    const before = await company({
      status: "ACTIVE",
      licenses: 3,
      subscription: `sub_test_${Math.random().toString(36).slice(2, 10)}`,
    });

    await expect(
      setSubscriptionStatus({
        actorEmail: actor,
        companyId: before.id,
        status: "TRIALING",
        reason: "Borde inte gå",
      })
    ).rejects.toThrow(PlatformActionError);

    const after = await unsafeGlobalPrisma.company.findUnique({
      where: { id: before.id },
      select: { subscriptionStatus: true, screenLicenses: true },
    });

    expect(after?.subscriptionStatus).toBe("ACTIVE");
    expect(after?.screenLicenses).toBe(3);
  });
});

/**
 * RADERING AV ETT KUNDFÖRETAG.
 *
 * Den enda åtgärden i systemet som förstör data utan väg tillbaka. Tre spärrar
 * vaktar den, och alla tre prövas här: en pågående prenumeration hos Stripe,
 * företagsnamnet skrivet för hand, och en anledning.
 *
 * Att åtgärdsloggen överlever raderingen är inte en detalj. Den är den enda
 * kvarvarande uppgiften om att kunden funnits, och om vem som tog beslutet.
 */
describe("radera ett kundföretag", () => {
  const actor = "adi@terafalk.com";

  async function company(subscription?: string) {
    return unsafeGlobalPrisma.company.create({
      data: {
        name: `Platformtest radera ${Math.random().toString(36).slice(2, 8)}`,
        stripeSubscriptionId: subscription ?? null,
      },
    });
  }

  afterEach(async () => {
    await unsafeGlobalPrisma.company.deleteMany({
      where: { name: { startsWith: "Platformtest " } },
    });
    await unsafeGlobalPrisma.platformAuditLog.deleteMany({
      where: { actorEmail: actor },
    });
  });

  it("ett företag med prenumeration hos Stripe raderas inte", async () => {
    const target = await company(
      `sub_test_${Math.random().toString(36).slice(2, 10)}`
    );

    await expect(
      deleteCompany({
        actorEmail: actor,
        companyId: target.id,
        confirmName: target.name,
        reason: "Borde inte gå",
      })
    ).rejects.toThrow(PlatformActionError);

    expect(
      await unsafeGlobalPrisma.company.count({ where: { id: target.id } })
    ).toBe(1);
  });

  it("fel namn stoppar raderingen", async () => {
    const target = await company();

    await expect(
      deleteCompany({
        actorEmail: actor,
        companyId: target.id,
        confirmName: "Något annat AB",
        reason: "Avslutat kundförhållande",
      })
    ).rejects.toThrow(PlatformActionError);

    expect(
      await unsafeGlobalPrisma.company.count({ where: { id: target.id } })
    ).toBe(1);
  });

  it("utan anledning raderas ingenting", async () => {
    const target = await company();

    await expect(
      deleteCompany({
        actorEmail: actor,
        companyId: target.id,
        confirmName: target.name,
        reason: "   ",
      })
    ).rejects.toThrow(PlatformActionError);

    expect(
      await unsafeGlobalPrisma.company.count({ where: { id: target.id } })
    ).toBe(1);
  });

  it("allt som hör till företaget följer med, men loggen står kvar", async () => {
    const target = await company();

    const employee = await unsafeGlobalPrisma.employee.create({
      data: { companyId: target.id, name: "Anna Andersson" },
    });
    const order = await unsafeGlobalPrisma.order.create({
      data: { companyId: target.id, orderNumber: "9001" },
    });
    const moment = await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: target.id, name: "Svetsning" },
    });
    await unsafeGlobalPrisma.kioskDevice.create({
      data: { companyId: target.id, name: "Verkstaden" },
    });
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId: target.id,
        employeeId: employee.id,
        orderId: order.id,
        momentId: moment.id,
        clockInAt: new Date(),
      },
    });
    await unsafeGlobalPrisma.platformNote.create({
      data: {
        targetCompanyId: target.id,
        body: "Kontaktperson: Bertil",
        updatedByEmail: actor,
      },
    });

    await deleteCompany({
      actorEmail: actor,
      companyId: target.id,
      confirmName: target.name,
      reason: "Avslutat kundförhållande",
    });

    expect(
      await unsafeGlobalPrisma.company.count({ where: { id: target.id } })
    ).toBe(0);
    expect(
      await unsafeGlobalPrisma.employee.count({
        where: { companyId: target.id },
      })
    ).toBe(0);
    expect(
      await unsafeGlobalPrisma.timeEntry.count({
        where: { companyId: target.id },
      })
    ).toBe(0);
    expect(
      await unsafeGlobalPrisma.kioskDevice.count({
        where: { companyId: target.id },
      })
    ).toBe(0);

    // Anteckningen saknar koppling till företaget i databasen och måste
    // raderas uttryckligen. Annars låg en intern notering kvar om en kund som
    // inte längre finns.
    expect(
      await unsafeGlobalPrisma.platformNote.count({
        where: { targetCompanyId: target.id },
      })
    ).toBe(0);

    // Kvar: raden som säger vem som raderade, när, och vad som fanns.
    const log = await unsafeGlobalPrisma.platformAuditLog.findFirst({
      where: { actorEmail: actor, action: "Raderade kundföretag" },
      orderBy: { createdAt: "desc" },
    });

    expect(log).not.toBeNull();
    expect(log?.detail).toContain(target.name);
    expect(log?.detail).toContain("Avslutat kundförhållande");
  });
});
