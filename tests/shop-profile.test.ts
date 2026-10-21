import { describe, expect, it } from "vitest";
import {
  emptyProfile,
  isEmail,
  normalizeOrgNumber,
  normalizePostalCode,
  profileToValues,
  readProfileForm,
  validateProfile,
  type ProfileValues,
} from "@/lib/shop/profile";
import { cleanTrackingUrl } from "@/lib/shop/admin";
import { safeAdminNext } from "@/lib/login-ticket";

/**
 * LEVERANSUPPGIFTERNA, SPÅRNINGSLÄNKEN OCH RETURADRESSEN VID INLOGGNING.
 *
 * Det som måste hålla:
 *   en beställning kräver allt som behövs för att skicka och fakturera
 *   inställningarna sparar även halvt ifyllt, men aldrig något felskrivet
 *   en bortvald fakturaadress ligger inte kvar
 *   bara https-länkar till kunden, bara adresser i panelen efter inloggning
 *
 * Behöver ingen databas.
 */

const COMPLETE: ProfileValues = {
  ...emptyProfile(),
  orgNumber: "5566778899",
  contactName: "Anna Andersson",
  orderEmail: "Inkop@Verkstad.se",
  phone: "070-123 45 67",
  addressLine: "Industrigatan 4",
  postalCode: "46130",
  city: "Trollhättan",
};

describe("en beställning", () => {
  it("normaliserar det som skrivits", () => {
    const { errors, clean } = validateProfile(
      { values: COMPLETE, separateBilling: false },
      { requireForOrder: true }
    );

    expect(errors).toEqual({});
    expect(clean).toMatchObject({
      orgNumber: "556677-8899",
      orderEmail: "inkop@verkstad.se",
      phone: "+46701234567",
      postalCode: "461 30",
      deliveryReference: null,
      billingAddressLine: null,
    });
  });

  it("kräver kontakt och leveransadress", () => {
    const { errors, clean } = validateProfile(
      { values: emptyProfile(), separateBilling: false },
      { requireForOrder: true }
    );

    expect(clean).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(
      ["addressLine", "city", "contactName", "orderEmail", "orgNumber", "phone", "postalCode"].sort()
    );
  });

  it("kräver fakturaadressen bara när den valts", () => {
    const withBilling = validateProfile(
      { values: COMPLETE, separateBilling: true },
      { requireForOrder: true }
    );
    expect(Object.keys(withBilling.errors).sort()).toEqual(
      ["billingAddressLine", "billingCity", "billingPostalCode"].sort()
    );
  });
});

describe("en beställning utan leverans", () => {
  it("kräver adressen men tömmer märkning och separat fakturaadress", () => {
    const { errors, clean } = validateProfile(
      {
        values: {
          ...COMPLETE,
          deliveryReference: "Verkstaden",
          billingAddressLine: "Box 12",
          billingPostalCode: "46121",
          billingCity: "Trollhättan",
        },
        separateBilling: true,
      },
      { requireForOrder: true, delivery: false }
    );

    expect(errors).toEqual({});
    expect(clean).toMatchObject({
      addressLine: "Industrigatan 4",
      deliveryReference: null,
      billingAddressLine: null,
      billingCity: null,
    });
  });

  it("kräver fortfarande en adress att fakturera till", () => {
    const { errors } = validateProfile(
      { values: { ...COMPLETE, addressLine: "" }, separateBilling: false },
      { requireForOrder: true, delivery: false }
    );
    expect(errors.addressLine).toBeDefined();
  });
});

describe("inställningarna", () => {
  it("sparar halvt ifyllt", () => {
    const { errors, clean } = validateProfile(
      { values: { ...emptyProfile(), city: "Vänersborg" }, separateBilling: false },
      { requireForOrder: false }
    );
    expect(errors).toEqual({});
    expect(clean?.city).toBe("Vänersborg");
    expect(clean?.orgNumber).toBeNull();
  });

  it("men aldrig något felskrivet", () => {
    for (const values of [
      { orgNumber: "5566778890" },
      { postalCode: "4613" },
      { orderEmail: "inkop.verkstad.se" },
      { phone: "abc" },
    ]) {
      const { clean } = validateProfile(
        { values: { ...emptyProfile(), ...values }, separateBilling: false },
        { requireForOrder: false }
      );
      expect(clean, JSON.stringify(values)).toBeNull();
    }
  });

  it("tömmer en bortvald fakturaadress", () => {
    const { clean } = validateProfile(
      {
        values: {
          ...COMPLETE,
          billingAddressLine: "Box 12",
          billingPostalCode: "46121",
          billingCity: "Trollhättan",
          invoiceEmail: "faktura@verkstad.se",
        },
        separateBilling: false,
      },
      { requireForOrder: true }
    );

    expect(clean).toMatchObject({
      billingAddressLine: null,
      billingPostalCode: null,
      billingCity: null,
      invoiceEmail: null,
    });
  });

  it("läser formuläret och tillbaka", () => {
    const form = new FormData();
    form.set("city", "  Trollhättan ");
    form.set("billingCity", "Vänersborg");
    form.set("separateBilling", "on");

    const read = readProfileForm(form);
    expect(read.values.city).toBe("Trollhättan");
    expect(read.separateBilling).toBe(true);

    const back = profileToValues({ phone: "+46701234567", billingCity: "Vänersborg" });
    expect(back.values.phone).toBe("+46 70 123 45 67");
    expect(back.separateBilling).toBe(true);
    expect(profileToValues(null).separateBilling).toBe(false);
  });
});

describe("formaten", () => {
  it("organisationsnummer med kontrollsiffra", () => {
    expect(normalizeOrgNumber("556677-8899")).toBe("556677-8899");
    expect(normalizeOrgNumber("16 556677 8899")).toBe("556677-8899");
    expect(normalizeOrgNumber("556677-8898")).toBeNull();
    expect(normalizeOrgNumber("55667788")).toBeNull();
  });

  it("postnummer", () => {
    expect(normalizePostalCode("461 30")).toBe("461 30");
    expect(normalizePostalCode("46130")).toBe("461 30");
    expect(normalizePostalCode("4613a")).toBeNull();
  });

  it("e-post", () => {
    expect(isEmail("a@b.se")).toBe(true);
    expect(isEmail("a b@c.se")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
  });
});

describe("spårningslänken", () => {
  it("bara https och en riktig adress", () => {
    expect(cleanTrackingUrl("https://tracking.postnord.com/se/?id=123")).toBe(
      "https://tracking.postnord.com/se/?id=123"
    );
    expect(cleanTrackingUrl("http://example.se/x")).toBeNull();
    expect(cleanTrackingUrl("javascript:alert(1)")).toBeNull();
    expect(cleanTrackingUrl("https://user:pw@example.se")).toBeNull();
    expect(cleanTrackingUrl("https://localhost/x")).toBeNull();
    expect(cleanTrackingUrl(`https://example.se/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("returadressen efter inloggning", () => {
  it("bara sidor i panelen", () => {
    expect(safeAdminNext("/admin/butik/kassa?stamplingsskarm=1")).toBe(
      "/admin/butik/kassa?stamplingsskarm=1"
    );
    expect(safeAdminNext("/admin")).toBe("/admin");
  });

  it("aldrig en annan sajt, plattformen eller inloggningen igen", () => {
    for (const value of [
      "https://evil.se/admin",
      "//evil.se/admin",
      "/\\evil.se",
      "/plattform",
      "/administrera",
      "/admin/login?till=/admin",
      "",
      null,
      undefined,
    ]) {
      expect(safeAdminNext(value), String(value)).toBeUndefined();
    }
  });
});
