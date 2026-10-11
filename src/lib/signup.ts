import bcrypt from "bcryptjs";
import { DEFAULT_ABSENCE_REASONS } from "./absence";
import { unsafeGlobalPrisma } from "./db";
import { trialEndDate } from "./subscription";
import { normalizePhone } from "./phone";
import { nameProblem, storedName } from "./person-name";

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

/**
 * FORMULÄRETS TVÅ STEG (infört 2026-10-11, issue #16).
 *
 * Steg 1 är personen, steg 2 är arbetsytan. Varje fel vet vilket steg det hör
 * till, så att formuläret kan gå TILLBAKA till fältet det handlar om.
 *
 * Utan det kunde den som stod på steg 2 få "Det finns redan ett konto med den
 * e-postadressen" över ett företagsnamn och ett lösenord, alltså ett besked om
 * ett fält som inte syns. Steget hör till felet och inte till formuläret:
 * servern vet vilket fält som brast, webbläsaren vet det inte.
 */
export type SignupStep = 1 | 2;

/** Ett fel med stegets nummer, så att formuläret kan visa rätt fält. */
export interface SignupProblem {
  message: string;
  step: SignupStep;
}

export class SignupError extends Error {
  readonly step: SignupStep;

  constructor(message: string, step: SignupStep = 1) {
    super(message);
    this.name = "SignupError";
    this.step = step;
  }
}

/** Kortare än så är inte ett lösenord värt namnet. */
const MIN_PASSWORD_LENGTH = 10;

export interface SignupInput {
  companyName: string;
  /**
   * Den som registrerar, och därmed blir ägare. Två fält och inte ett
   * sedan 2026-10-11, se person-name.ts.
   */
  firstName: string;
  lastName: string;
  email: string;
  /**
   * Ägarens telefonnummer, i vilken form som helst. Sparas normaliserat.
   *
   * Krävs (bestämt 2026-10-05): det är så vi når kunden när något rör kontot,
   * driften eller betalningen, och så support kan känna igen en ägare som
   * blivit utelåst. Se AdminUser.phone i schemat.
   */
  phone: string;
  password: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Kontrollerar uppgifterna innan något skapas.
 *
 * Returnerar ett meddelande skrivet för att läsas av en människa, med numret
 * på det steg fältet står på, eller null om allt är i sin ordning.
 *
 * ORDNINGEN FÖLJER STEGEN och inte fältens ordning i databasen. Den som fyllt
 * i båda stegen och har fel i båda ska skickas tillbaka till det FÖRSTA
 * felet; rättar man bakifrån hoppar formuläret fram och tillbaka.
 */
export function validateSignup(input: SignupInput): SignupProblem | null {
  const name = nameProblem(input);
  if (name) return { message: name, step: 1 };

  const email = normalizeEmail(input.email);
  // Avsiktligt enkel kontroll. Den enda som med säkerhet avgör om en adress
  // fungerar är ett utskickat mejl — resten är gissningar som mest råkar
  // stänga ute ovanliga men giltiga adresser.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { message: "Kontrollera e-postadressen.", step: 1 };
  }

  if (!normalizePhone(input.phone)) {
    return { message: "Kontrollera telefonnumret.", step: 1 };
  }

  if (input.companyName.trim().length < 2) {
    return { message: "Ange företagets namn.", step: 2 };
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      message: `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`,
      step: 2,
    };
  }

  return null;
}

export async function createCompanyWithOwner(input: SignupInput) {
  const problem = validateSignup(input);
  if (problem) throw new SignupError(problem.message, problem.step);

  const email = normalizeEmail(input.email);

  const existing = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    // Steg 1: adressen står där, och det är den som ska rättas.
    throw new SignupError(
      "Det finns redan ett konto med den e-postadressen. Logga in i stället.",
      1
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
        trialEndsAt: trialEndDate(),
      },
    });

    const owner = await tx.adminUser.create({
      data: {
        companyId: company.id,
        email,
        ...storedName(input),
        // Kontrollerat av validateSignup ovan, så null förekommer inte här.
        phone: normalizePhone(input.phone),
        passwordHash: await bcrypt.hash(input.password, 12),
        role: "OWNER",
      },
    });

    // FRÅNVAROORSAKERNA FÖLJER MED FRÅN START. De är kundens egna och går att
    // ändra, men en tom lista vid första inloggningen ser ut som att
    // funktionen saknas. Skrivs här och inte vid första besöket på sidan: en
    // sida som skriver när den läses går inte att öppna i supportläge, där
    // allt skrivande avvisas.
    await tx.absenceReason.createMany({
      data: DEFAULT_ABSENCE_REASONS.map((reason, index) => ({
        companyId: company.id,
        name: reason.name,
        countsAsComp: reason.countsAsComp ?? false,
        sortOrder: index,
      })),
    });

    return { company, owner };
  });
}
