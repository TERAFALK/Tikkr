import { normalizePhone } from "../phone";
import type { NormalizedCustomer } from "./provider";

/**
 * MATCHNINGSREGLERNA, gemensamma för alla integrationer (CLAUDE.md § 3.5).
 *
 * Bara rena funktioner här: vad som räknas som samma organisationsnummer,
 * samma namn, samma telefon, och vilket beslut en träffbild ger. Databasen rörs
 * i ingest.ts och mappings.ts. Allt prövas av tests/integration-matching.test.ts.
 *
 * Kunder, i ordning:
 *   1. Befintlig koppling uppdateras.
 *   2. Samma organisationsnummer kopplas automatiskt, men bara vid EXAKT en träff.
 *   3. Namn, e-post, telefon och kundnummer ger bara FÖRSLAG i inkorgen.
 *   4. Ingen träff ger en ny kund eller inkorgen, efter inställningen.
 *
 * Bara organisationsnumret får koppla av sig självt. Två kunder kan heta
 * likadant, dela växelnummer eller ha samma nummer i två system utan att vara
 * samma kund, och en felkoppling skriver över den riktiga kundens uppgifter.
 */

/**
 * Organisationsnumret som tio siffror, eller null.
 *
 * "556677-8899", "5566778899" och "SE556677889901" (momsnummer) är samma
 * företag. Tolv siffror med sekelsiffror (19…, 20…, 16…) kortas till tio.
 */
export function normalizeOrgNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  // Momsnumret: SE + tio siffror + 01.
  if (/^se/i.test(raw.trim()) && digits.length === 12 && digits.endsWith("01")) {
    digits = digits.slice(0, 10);
  }
  if (digits.length === 12 && /^(16|18|19|20)/.test(digits)) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  // Tio nollor och liknande platshållare är inget nummer.
  if (/^(\d)\1{9}$/.test(digits)) return null;
  return digits;
}

/** Namnet utan bolagsform, skiljetecken och skiftläge. "Volvo AB" = "VOLVO". */
export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[.,&()"'/-]/g, " ")
    .replace(/\b(aktiebolag|ab|hb|kb|ek för|ekonomisk förening|handelsbolag|kommanditbolag|inc|ltd|oy|as|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name || null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

export function normalizePhoneForMatch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizePhone(raw);
}

export function normalizeCustomerNumber(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  return value ? value : null;
}

/** En kund i Tikkr, som matchningen ser den. */
export interface CandidateCustomer {
  id: string;
  name: string;
  customerNumber: string | null;
  orgNumber: string | null;
  email: string | null;
  phone: string | null;
}

export type SuggestionReason = "orgNumber" | "name" | "email" | "phone" | "customerNumber";

export interface Suggestion {
  customerId: string;
  reasons: SuggestionReason[];
}

/** Tikkr-kunder med samma organisationsnummer. */
export function orgNumberMatches(
  incoming: Pick<NormalizedCustomer, "orgNumber">,
  candidates: readonly CandidateCustomer[]
): CandidateCustomer[] {
  const org = normalizeOrgNumber(incoming.orgNumber);
  if (!org) return [];
  return candidates.filter((c) => normalizeOrgNumber(c.orgNumber) === org);
}

/**
 * Förslag i inkorgen. Organisationsnumret står med här också: det kopplar av
 * sig självt bara vid exakt en träff, och vid flera ska administratören se
 * dem. Flest skäl först, och vid lika i namnordning, så att listan ser
 * likadan ut varje gång.
 */
export function suggestCustomers(
  incoming: NormalizedCustomer,
  candidates: readonly CandidateCustomer[],
  limit = 5
): Suggestion[] {
  const org = normalizeOrgNumber(incoming.orgNumber);
  const name = normalizeName(incoming.name);
  const email = normalizeEmail(incoming.email);
  const phone = normalizePhoneForMatch(incoming.phone);
  const number = normalizeCustomerNumber(incoming.customerNumber);

  const out: (Suggestion & { name: string })[] = [];
  for (const c of candidates) {
    const reasons: SuggestionReason[] = [];
    if (org && normalizeOrgNumber(c.orgNumber) === org) reasons.push("orgNumber");
    if (name && normalizeName(c.name) === name) reasons.push("name");
    if (email && normalizeEmail(c.email) === email) reasons.push("email");
    if (phone && normalizePhoneForMatch(c.phone) === phone) reasons.push("phone");
    if (number && normalizeCustomerNumber(c.customerNumber) === number) reasons.push("customerNumber");
    if (reasons.length > 0) out.push({ customerId: c.id, reasons, name: c.name });
  }

  return out
    .sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name, "sv"))
    .slice(0, limit)
    .map(({ customerId, reasons }) => ({ customerId, reasons }));
}

/**
 * Varför en post ligger i inkorgen. Koderna lagras i
 * integration_mappings.pending_reason och översätts av panelen.
 */
export type PendingReason =
  | "suggestions"
  | "no-match"
  | "org-ambiguous"
  | "org-taken"
  | "number-taken"
  | "customer-unlinked"
  | "customer-ignored"
  | "unlinked";

export type CustomerDecision =
  | { action: "link"; customerId: string }
  | { action: "create" }
  | { action: "pending"; reason: PendingReason };

/**
 * Beslutet för en kund som INTE redan är kopplad.
 *
 * @param orgMatches Tikkr-kunder med samma organisationsnummer.
 * @param linkedHere Tikkr-kunder som redan är kopplade i den här integrationen.
 *   En sådan kan inte kopplas en gång till; två Visma-kunder på samma Tikkr-kund
 *   vore två källor som skriver över varandra.
 * @param createCustomers Inställningen "Skapa nya kunder direkt".
 * @param numberTaken Kundnumret finns redan på en annan Tikkr-kund.
 */
export function decideCustomer(input: {
  orgMatches: readonly CandidateCustomer[];
  suggestions: readonly Suggestion[];
  linkedHere: ReadonlySet<string>;
  createCustomers: boolean;
  numberTaken: boolean;
  /**
   * false när en administratör kopplat loss posten. Då kopplas den inte
   * automatiskt igen, och skapas inte heller: någon har sagt att träffen var
   * fel, och beslutet ligger kvar hos dem.
   */
  automatic?: boolean;
}): CustomerDecision {
  if (input.automatic === false) return { action: "pending", reason: "unlinked" };
  if (input.orgMatches.length > 1) return { action: "pending", reason: "org-ambiguous" };
  if (input.orgMatches.length === 1) {
    const match = input.orgMatches[0];
    if (input.linkedHere.has(match.id)) return { action: "pending", reason: "org-taken" };
    return { action: "link", customerId: match.id };
  }
  if (input.suggestions.length > 0) return { action: "pending", reason: "suggestions" };
  if (!input.createCustomers) return { action: "pending", reason: "no-match" };
  if (input.numberTaken) return { action: "pending", reason: "number-taken" };
  return { action: "create" };
}

/**
 * Fälten källan äger, som de skrivs till en kund i Tikkr.
 *
 * Påslag, rabatt, anteckningar och aktiv står inte här och rörs aldrig av en
 * synk. Det är Tikkrs fält.
 */
export function sourceOwnedCustomerFields(c: NormalizedCustomer) {
  return {
    name: c.name,
    customerNumber: c.customerNumber,
    orgNumber: c.orgNumber,
    contactName: c.contactName,
    email: c.email,
    phone: c.phone,
    addressLine: c.addressLine,
    postalCode: c.postalCode,
    city: c.city,
  };
}
