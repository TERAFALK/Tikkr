import { describe, it, expect, afterEach, afterAll } from "vitest";
import { isPlatformAdmin, platformAdminEmails } from "@/lib/platform-access";
import {
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
