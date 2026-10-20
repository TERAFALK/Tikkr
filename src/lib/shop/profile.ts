import { formatPhone, normalizePhone } from "../phone";

/**
 * FÖRETAGETS LEVERANS- OCH FAKTURAUPPGIFTER, SOM FORMULÄR.
 *
 * Samma fält står på två sidor: under Inställningar, Företag, och i
 * beställningsformuläret. Fälten ritas av `ProfileFields` och läses HÄR, på
 * ett ställe, av samma skäl som schemats `readScheduleDays`: två läsare av
 * samma fält glider isär vid första ändringen.
 *
 * Skillnaden mellan sidorna är bara vad som KRÄVS. Inställningarna sparar det
 * som står, även halvt ifyllt. En beställning kräver allt som behövs för att
 * skicka och fakturera.
 *
 * Inga databasanrop, så att reglerna går att pröva utan databas.
 */

export interface ProfileValues {
  orgNumber: string;
  contactName: string;
  orderEmail: string;
  phone: string;
  addressLine: string;
  postalCode: string;
  city: string;
  deliveryReference: string;
  billingAddressLine: string;
  billingPostalCode: string;
  billingCity: string;
  invoiceEmail: string;
}

export type ProfileField = keyof ProfileValues;
export type ProfileErrors = Partial<Record<ProfileField, string>>;

export const PROFILE_FIELDS: ProfileField[] = [
  "orgNumber",
  "contactName",
  "orderEmail",
  "phone",
  "addressLine",
  "postalCode",
  "city",
  "deliveryReference",
  "billingAddressLine",
  "billingPostalCode",
  "billingCity",
  "invoiceEmail",
];

const BILLING_FIELDS: ProfileField[] = [
  "billingAddressLine",
  "billingPostalCode",
  "billingCity",
  "invoiceEmail",
];

/** Det en beställning inte kan skickas utan. */
const REQUIRED_FOR_ORDER: ProfileField[] = [
  "orgNumber",
  "contactName",
  "orderEmail",
  "phone",
  "addressLine",
  "postalCode",
  "city",
];

const REQUIRED_BILLING: ProfileField[] = [
  "billingAddressLine",
  "billingPostalCode",
  "billingCity",
];

const MISSING: Record<ProfileField, string> = {
  orgNumber: "Skriv organisationsnumret.",
  contactName: "Skriv kontaktpersonens namn.",
  orderEmail: "Skriv en e-postadress.",
  phone: "Skriv ett telefonnummer.",
  addressLine: "Skriv leveransadressen.",
  postalCode: "Skriv postnumret.",
  city: "Skriv orten.",
  deliveryReference: "",
  billingAddressLine: "Skriv fakturaadressen.",
  billingPostalCode: "Skriv postnumret.",
  billingCity: "Skriv orten.",
  invoiceEmail: "",
};

export const MAX_PROFILE_FIELD = 200;

export function emptyProfile(): ProfileValues {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, ""])) as unknown as ProfileValues;
}

/** Fälten som de skrevs, trimmade. Rör inget format. */
export function readProfileForm(formData: FormData): {
  values: ProfileValues;
  separateBilling: boolean;
} {
  const values = emptyProfile();

  for (const field of PROFILE_FIELDS) {
    values[field] = String(formData.get(field) ?? "").trim();
  }

  return { values, separateBilling: formData.get("separateBilling") === "on" };
}

/** Uppgifterna som de ska sparas: normaliserade, tomt som null. */
export type CleanProfile = { [K in ProfileField]: string | null };

/**
 * Prövar och normaliserar.
 *
 * Utan separat fakturaadress töms fakturafälten, så att en adress som en gång
 * skrevs in och sedan valdes bort inte ligger kvar och fakturerar i det tysta.
 * E-post för faktura hör till faktureringen och följer samma val.
 */
export function validateProfile(
  input: { values: ProfileValues; separateBilling: boolean },
  options: { requireForOrder: boolean }
): { errors: ProfileErrors; clean: CleanProfile | null } {
  const values = { ...input.values };
  const errors: ProfileErrors = {};

  if (!input.separateBilling) {
    for (const field of BILLING_FIELDS) values[field] = "";
  }

  const required = options.requireForOrder
    ? [...REQUIRED_FOR_ORDER, ...(input.separateBilling ? REQUIRED_BILLING : [])]
    : [];

  for (const field of PROFILE_FIELDS) {
    if (values[field].length > MAX_PROFILE_FIELD) {
      errors[field] = `Högst ${MAX_PROFILE_FIELD} tecken.`;
    } else if (!values[field] && required.includes(field)) {
      errors[field] = MISSING[field];
    }
  }

  const clean = Object.fromEntries(
    PROFILE_FIELDS.map((field) => [field, values[field] || null])
  ) as CleanProfile;

  if (clean.orgNumber && !errors.orgNumber) {
    const normalized = normalizeOrgNumber(clean.orgNumber);
    if (normalized) clean.orgNumber = normalized;
    else errors.orgNumber = "Organisationsnumret består av tio siffror, t.ex. 556677-8899.";
  }

  for (const field of ["postalCode", "billingPostalCode"] as const) {
    const value = clean[field];
    if (value && !errors[field]) {
      const normalized = normalizePostalCode(value);
      if (normalized) clean[field] = normalized;
      else errors[field] = "Postnumret består av fem siffror.";
    }
  }

  for (const field of ["orderEmail", "invoiceEmail"] as const) {
    const value = clean[field];
    if (value && !errors[field]) {
      if (isEmail(value)) clean[field] = value.toLowerCase();
      else errors[field] = "Skriv en hel e-postadress, t.ex. inkop@foretaget.se.";
    }
  }

  if (clean.phone && !errors.phone) {
    const normalized = normalizePhone(clean.phone);
    if (normalized) clean.phone = normalized;
    else errors.phone = "Telefonnumret går inte att tolka. Skriv det med riktnummer.";
  }

  return Object.keys(errors).length > 0 ? { errors, clean: null } : { errors, clean };
}

/** Lagrade uppgifter som formulärvärden. Telefonnumret visas grupperat. */
export function profileToValues(
  profile: Partial<CleanProfile> | null | undefined
): { values: ProfileValues; separateBilling: boolean } {
  const values = emptyProfile();

  for (const field of PROFILE_FIELDS) {
    values[field] = profile?.[field] ?? "";
  }
  if (values.phone) values.phone = formatPhone(values.phone);

  const separateBilling = BILLING_FIELDS.some((field) => Boolean(profile?.[field]));
  return { values, separateBilling };
}

/**
 * Tio siffror som "556677-8899", eller null.
 *
 * Tolv siffror godtas när de två första är ett sekel (16, 19 eller 20), som
 * i ett personnummer för en enskild firma. Kontrollsiffran prövas, eftersom
 * ett felskrivet organisationsnummer på en faktura är ett fel som upptäcks
 * först av kundens ekonomiavdelning.
 */
export function normalizeOrgNumber(raw: string): string | null {
  let digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;

  if (digits.length === 12 && /^(16|19|20)/.test(digits)) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  if (!luhnValid(digits)) return null;

  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function luhnValid(digits: string): boolean {
  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    let value = Number(digits[i]);
    if (i % 2 === 0) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }

  return sum % 10 === 0;
}

/** Fem siffror som "123 45", eller null. */
export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/\s/g, "");
  if (!/^\d{5}$/.test(digits)) return null;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/**
 * Rimlig och inte uttömmande, som telefonnumret: något före och efter ett @,
 * en punkt i domänen, inga mellanslag. Den enda som vet om adressen fungerar
 * är den som får mejlet.
 */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
