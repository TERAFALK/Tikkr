import { describe, it, expect, afterEach } from "vitest";
import { isPlatformAdmin, platformAdminEmails } from "@/lib/platform-admin";

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
