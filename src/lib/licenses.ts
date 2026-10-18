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
  /** Antal upplagda skärmar just nu. */
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
    // Alla upplagda skärmar, inte bara de som hunnit kopplas. En skärm som
    // ligger i listan och väntar på sin kod upptar en licens — det är kunden
    // som bestämt att den ska finnas, och licensen frigörs när den raderas.
    forCompany(companyId).kioskDevice.count(),
  ]);

  const total = company?.screenLicenses ?? TRIAL_LICENSES;

  return { total, used, available: Math.max(0, total - used) };
}

/**
 * LÄGGER UPP EN SKÄRM, BARA OM EN LICENS ÄR LEDIG, OCH ALDRIG TVÅ PÅ EN
 * (tillagt 2026-10-18, säkerhetsgranskningen).
 *
 * Prövningen och skapandet var två steg utan något emellan, så två tryck på
 * Lägg till i samma ögonblick läste båda "en licens ledig" och skapade varsin
 * skärm. Nu sker båda i en transaktion som först tar ett lås per företag: den
 * andra väntar tills den första sparat, och ser då dess skärm.
 *
 * Allt går genom transaktionens egen klient. Hade arbetet gått genom en annan
 * anslutning medan låset hölls kunde samtidiga tryck ta slut på
 * anslutningarna, och då väntar alla på varandra. Därför `companyId` utskrivet
 * i frågan, som i kiosk-auth.ts. Låset är rå SQL men utan kunddata, som i
 * clock.ts. Kopplingskoden tas fram efteråt, utanför låset, se startPairing.
 */
export async function createLicensedDevice(companyId: string, name: string) {
  return unsafeGlobalPrisma.$transaction(async (tx) => {
    const lockKey = `licenses:${companyId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const [company, used] = await Promise.all([
      tx.company.findUnique({
        where: { id: companyId },
        select: { screenLicenses: true },
      }),
      tx.kioskDevice.count({ where: { companyId } }),
    ]);

    const total = company?.screenLicenses ?? TRIAL_LICENSES;
    if (used >= total) throw new LicenseError(fullMessage(total));

    return tx.kioskDevice.create({ data: { companyId, name } });
  });
}

function fullMessage(total: number): string {
  return (
    `Samtliga ${total} licenser används. Utöka antalet under ` +
    `Inställningar → Prenumeration, eller radera en skärm ni inte ` +
    `längre använder.`
  );
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

  throw new LicenseError(fullMessage(state.total));
}

/**
 * Sätter antalet licenser. Anropas när Stripe bekräftat en ändring.
 *
 * Antalet kan bli lägre än antalet aktiva skärmar: kunden väljer det hos
 * Stripe, och vi kan inte hindra dem där. Ingen skärm stängs av för det.
 * Stämplingen ska aldrig sluta fungera, och vilken skärm som ska bort är
 * kundens beslut — panelen påpekar skillnaden istället.
 */
export async function setLicenseCount(
  companyId: string,
  count: number
): Promise<void> {
  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { screenLicenses: Math.max(1, count) },
  });
}
