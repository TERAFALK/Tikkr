import { unsafeGlobalPrisma } from "./db";
import { forCompany } from "./tenant";

/**
 * LICENSER FÖR STÄMPLINGSSKÄRMAR.
 *
 * Kunden köper ett antal skärmar och kan skapa så många. Vill de ha fler ökar
 * de antalet, vilket ändrar fakturan.
 *
 * Skälet till att göra det så istället för att låta fakturan följa antalet
 * skapade skärmar: kostnaden ska aldrig växa utan att någon bestämt det. En
 * administratör som lägger upp en extra skärm för att prova något ska inte
 * upptäcka det på nästa faktura.
 *
 * Under provperioden ingår två. Det räcker för att prova på riktigt — en i
 * verkstaden och en till för att se att flera skärmar fungerar ihop — utan att
 * någon hinner bygga upp en hel installation gratis.
 */

export const TRIAL_LICENSES = 2;

export class LicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicenseError";
  }
}

export interface LicenseState {
  /** Antal skärmar företaget får ha aktiva. */
  total: number;
  /** Antal aktiva skärmar just nu. */
  used: number;
  /** Hur många som går att skapa till. */
  available: number;
}

export async function getLicenseState(companyId: string): Promise<LicenseState> {
  const [company, used] = await Promise.all([
    unsafeGlobalPrisma.company.findUnique({
      where: { id: companyId },
      select: { screenLicenses: true },
    }),
    forCompany(companyId).kioskDevice.count({ where: { active: true } }),
  ]);

  const total = company?.screenLicenses ?? TRIAL_LICENSES;

  return { total, used, available: Math.max(0, total - used) };
}

/**
 * Vägrar om det inte finns en ledig licens.
 *
 * Meddelandet säger vad som behöver göras, inte bara att det inte gick. Ett
 * "otillåtet" utan förklaring får folk att tro att något är trasigt.
 */
export async function assertLicenseAvailable(companyId: string): Promise<void> {
  const state = await getLicenseState(companyId);

  if (state.available > 0) return;

  throw new LicenseError(
    `Alla ${state.total} licenser är använda. Öka antalet under ` +
      `Inställningar → Prenumeration, eller återkalla en skärm ni inte ` +
      `längre använder.`
  );
}

/**
 * Kontrollerar att ett nytt antal licenser går att sätta.
 *
 * Att sänka under antalet aktiva skärmar skulle betyda att någon skärm slutar
 * fungera utan att kunden pekat ut vilken. Den valet måste de göra själva.
 */
export async function assertLicenseCountAllowed(
  companyId: string,
  next: number
): Promise<void> {
  if (!Number.isInteger(next) || next < 1) {
    throw new LicenseError("Antalet måste vara minst en skärm.");
  }

  if (next > 100) {
    throw new LicenseError(
      "Fler än hundra licenser hanteras manuellt. Kontakta support@tikkr.se."
    );
  }

  const state = await getLicenseState(companyId);

  if (next < state.used) {
    throw new LicenseError(
      `Ni har ${state.used} aktiva skärmar. Återkalla de ni inte längre ` +
        `använder innan ni sänker antalet licenser.`
    );
  }
}

/** Sätter antalet licenser. Anropas när Stripe bekräftat en ändring. */
export async function setLicenseCount(
  companyId: string,
  count: number
): Promise<void> {
  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { screenLicenses: Math.max(1, count) },
  });
}
