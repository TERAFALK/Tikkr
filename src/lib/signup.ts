import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";

/**
 * REGISTRERING AV NYTT FÖRETAG.
 *
 * Skapar en helt ny arbetsyta: ett företag och dess första administratör, som
 * blir ägare. Allt annat läggs upp av kunden själv i kom-igång-guiden.
 *
 * Använder den ofiltrerade databasklienten med flit — företaget existerar inte
 * än, så det finns inget företags-id att filtrera på. Det är samma undantag som
 * vid inloggning. Efter det här steget går all åtkomst via forCompany().
 */

export class SignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignupError";
  }
}

/** Kortare än så är inte ett lösenord värt namnet. */
const MIN_PASSWORD_LENGTH = 10;

export interface SignupInput {
  companyName: string;
  email: string;
  password: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Kontrollerar uppgifterna innan något skapas.
 *
 * Returnerar ett meddelande skrivet för att läsas av en människa, eller null
 * om allt är i sin ordning.
 */
export function validateSignup(input: SignupInput): string | null {
  if (input.companyName.trim().length < 2) {
    return "Skriv företagets namn.";
  }

  const email = normalizeEmail(input.email);
  // Avsiktligt enkel kontroll. Den enda som med säkerhet avgör om en adress
  // fungerar är ett utskickat mejl — resten är gissningar som mest råkar
  // stänga ute ovanliga men giltiga adresser.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return "Kontrollera e-postadressen.";
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`;
  }

  return null;
}

export async function createCompanyWithOwner(input: SignupInput) {
  const problem = validateSignup(input);
  if (problem) throw new SignupError(problem);

  const email = normalizeEmail(input.email);

  const existing = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    throw new SignupError(
      "Det finns redan ett konto med den e-postadressen. Logga in istället."
    );
  }

  // Företag och ägare skapas i samma transaktion. Ett företag utan
  // administratör vore omöjligt att komma in i, och skulle bli en död rad
  // som ingen kan städa bort.
  return unsafeGlobalPrisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.companyName.trim(),
        subscriptionStatus: "TRIALING",
      },
    });

    const owner = await tx.adminUser.create({
      data: {
        companyId: company.id,
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: "OWNER",
      },
    });

    return { company, owner };
  });
}
