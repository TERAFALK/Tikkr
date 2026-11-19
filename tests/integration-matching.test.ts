import { describe, it, expect } from "vitest";
import {
  decideCustomer,
  normalizeName,
  normalizeOrgNumber,
  orgNumberMatches,
  sourceOwnedCustomerFields,
  suggestCustomers,
  type CandidateCustomer,
} from "@/lib/integrations/matching";
import type { NormalizedCustomer } from "@/lib/integrations/provider";

/**
 * MATCHNINGSREGLERNA (CLAUDE.md § 3.5), utan databas.
 *
 * Det som får koppla av sig självt är bara ett organisationsnummer med exakt
 * en träff. Allt annat är förslag. En felkoppling skriver över den riktiga
 * kundens uppgifter, och därför prövas varje väg dit här.
 */

const incoming = (over: Partial<NormalizedCustomer> = {}): NormalizedCustomer => ({
  name: "Volvo Lastvagnar AB",
  customerNumber: "1001",
  orgNumber: "556013-9700",
  contactName: null,
  email: "inkop@volvo.se",
  phone: "031-66 00 00",
  addressLine: null,
  postalCode: null,
  city: null,
  ...over,
});

const candidate = (over: Partial<CandidateCustomer> & { id: string }): CandidateCustomer => ({
  name: "Annan kund",
  customerNumber: null,
  orgNumber: null,
  email: null,
  phone: null,
  ...over,
});

describe("organisationsnumret", () => {
  it.each([
    ["556013-9700", "5560139700"],
    ["5560139700", "5560139700"],
    ["556013 9700", "5560139700"],
    ["16556013-9700", "5560139700"],
    ["SE556013970001", "5560139700"],
    ["19800101-1234", "8001011234"],
  ])("%s blir %s", (raw, expected) => {
    expect(normalizeOrgNumber(raw)).toBe(expected);
  });

  it.each(["", null, "123", "0000000000", "556013-97"])("%s är inget nummer", (raw) => {
    expect(normalizeOrgNumber(raw)).toBeNull();
  });
});

describe("namnet", () => {
  it("bolagsform, skiljetecken och skiftläge spelar ingen roll", () => {
    expect(normalizeName("Volvo Lastvagnar AB")).toBe(normalizeName("VOLVO LASTVAGNAR"));
    expect(normalizeName("Nilssons Svets & Smide, HB")).toBe(normalizeName("nilssons svets smide"));
  });

  it("två olika namn förblir olika", () => {
    expect(normalizeName("Volvo Lastvagnar AB")).not.toBe(normalizeName("Volvo Personvagnar AB"));
  });
});

describe("beslutet för en okopplad kund", () => {
  const none = { suggestions: [], linkedHere: new Set<string>(), createCustomers: false, numberTaken: false };

  it("samma organisationsnummer med exakt en träff kopplas automatiskt", () => {
    const matches = orgNumberMatches(incoming(), [candidate({ id: "c1", orgNumber: "5560139700" })]);
    expect(decideCustomer({ ...none, orgMatches: matches })).toEqual({ action: "link", customerId: "c1" });
  });

  it("två kunder med samma organisationsnummer kopplas inte, de blir ett förslag", () => {
    const list = [candidate({ id: "c1", orgNumber: "556013-9700" }), candidate({ id: "c2", orgNumber: "5560139700" })];
    expect(decideCustomer({ ...none, orgMatches: orgNumberMatches(incoming(), list) })).toEqual({
      action: "pending",
      reason: "org-ambiguous",
    });
    expect(suggestCustomers(incoming(), list).map((s) => s.customerId).sort()).toEqual(["c1", "c2"]);
  });

  it("en kund som redan är kopplad i integrationen kopplas inte en gång till", () => {
    const matches = [candidate({ id: "c1", orgNumber: "5560139700" })];
    expect(decideCustomer({ ...none, orgMatches: matches, linkedHere: new Set(["c1"]) })).toEqual({
      action: "pending",
      reason: "org-taken",
    });
  });

  it("namn, e-post, telefon och kundnummer kopplar aldrig, de föreslår", () => {
    const list = [
      candidate({ id: "namn", name: "VOLVO LASTVAGNAR" }),
      candidate({ id: "epost", email: "INKOP@volvo.se" }),
      candidate({ id: "telefon", phone: "+46 31 660000" }),
      candidate({ id: "nummer", customerNumber: "1001" }),
    ];
    const suggestions = suggestCustomers(incoming({ orgNumber: null }), list);
    expect(suggestions.map((s) => s.reasons[0]).sort()).toEqual(["customerNumber", "email", "name", "phone"]);
    expect(decideCustomer({ ...none, orgMatches: [], suggestions })).toEqual({ action: "pending", reason: "suggestions" });
  });

  it("flest skäl kommer först", () => {
    const list = [
      candidate({ id: "ett", name: "Volvo Lastvagnar" }),
      candidate({ id: "tva", name: "Volvo Lastvagnar", email: "inkop@volvo.se" }),
    ];
    expect(suggestCustomers(incoming({ orgNumber: null }), list)[0]).toEqual({ customerId: "tva", reasons: ["name", "email"] });
  });

  it("ingen träff hamnar i inkorgen som standard", () => {
    expect(decideCustomer({ ...none, orgMatches: [] })).toEqual({ action: "pending", reason: "no-match" });
  });

  it("ingen träff skapar en ny kund när inställningen säger det", () => {
    expect(decideCustomer({ ...none, orgMatches: [], createCustomers: true })).toEqual({ action: "create" });
  });

  it("en ny kund vars kundnummer redan finns skapas inte", () => {
    expect(decideCustomer({ ...none, orgMatches: [], createCustomers: true, numberTaken: true })).toEqual({
      action: "pending",
      reason: "number-taken",
    });
  });

  it("en loss-kopplad post kopplas inte automatiskt igen, inte ens på organisationsnummer", () => {
    const matches = [candidate({ id: "c1", orgNumber: "5560139700" })];
    expect(decideCustomer({ ...none, orgMatches: matches, createCustomers: true, automatic: false })).toEqual({
      action: "pending",
      reason: "unlinked",
    });
  });
});

describe("fälten källan äger", () => {
  it("är exakt källans, och aldrig Tikkrs egna", () => {
    const fields = sourceOwnedCustomerFields(incoming());
    expect(Object.keys(fields).sort()).toEqual(
      ["addressLine", "city", "contactName", "customerNumber", "email", "name", "orgNumber", "phone", "postalCode"].sort()
    );
    for (const own of ["markupPercent", "discountPercent", "notes", "active"]) {
      expect(fields).not.toHaveProperty(own);
    }
  });
});
