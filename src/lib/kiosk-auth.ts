import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { unsafeGlobalPrisma } from "./db";

/**
 * IDENTIFIERING AV KIOSKSKÄRMAR.
 *
 * En kioskskärm loggar aldrig in. Den får istället en lång slumpad token vid
 * uppsättningen, och den token avgör vilket företags anställda som visas.
 *
 * Två saker är viktiga:
 *
 * 1. Token sparas ALDRIG i klartext i databasen. Vi sparar ett kryptografiskt
 *    fingeravtryck. Kommer någon över en databaskopia kan de därför inte
 *    använda innehållet för att stämpla. Fingeravtrycket går inte att räkna
 *    baklänges till en token.
 *
 * 2. Token syns aldrig för någon människa. Den skapas när skärmen löser in sin
 *    kopplingskod och läggs direkt i en cookie. Det som skrivs av för hand är
 *    kortkoden — se längre ned — och den är förbrukad i samma stund.
 *
 * Modellen bygger på att skärmen sitter på arbetsplatsen, precis som en fysisk
 * stämpelklocka. Det ska vi vara tydliga med mot kunden.
 */

export const KIOSK_COOKIE = "tikkr_kiosk";

/** Hur länge en skärm förblir kopplad utan att sättas upp på nytt: ett år. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Skapar en ny token: 32 slumpade byte.
 *
 * Det är så många möjliga värden att det inte går att gissa sig till en, ens
 * med obegränsat antal försök. Därför räcker ett snabbt fingeravtryck (SHA-256)
 * — till skillnad från lösenord, som är korta och behöver medvetet långsam
 * hashning för att stå emot gissningar.
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Fingeravtrycket som sparas i databasen istället för själva token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface KioskSession {
  deviceId: string;
  deviceName: string;
  companyId: string;
  companyName: string;
}

/**
 * Slår upp vilken skärm en token tillhör.
 *
 * Använder den ofiltrerade databasklienten med flit: vi vet inte vilket företag
 * det gäller förrän uppslaget är gjort. Det är samma undantag som vid
 * inloggning. Efter det här steget går all vidare åtkomst via forCompany().
 */
export async function resolveDeviceToken(
  token: string
): Promise<KioskSession | null> {
  if (!token) return null;

  const device = await unsafeGlobalPrisma.kioskDevice.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { company: { select: { id: true, name: true } } },
  });

  // En skärm som kopplats om har ingen token längre, och den gamla cookien
  // hittar därför ingenting här. Det är så en borttappad surfplatta stängs
  // ute: utan att någon behöver röra själva skärmen.
  if (!device) return null;

  return {
    deviceId: device.id,
    deviceName: device.name,
    companyId: device.company.id,
    companyName: device.company.name,
  };
}

/** Läser skärmens cookie och slår upp vilken skärm det är. */
export async function getKioskSession(): Promise<KioskSession | null> {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  return token ? resolveDeviceToken(token) : null;
}

/** Inställningarna för skärmens cookie. Samlade så de inte glider isär. */
export function kioskCookieOptions() {
  return {
    httpOnly: true, // JavaScript på sidan kan inte läsa den
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/** Noterar att skärmen hörts av, så admin ser vilka skärmar som lever. */
export async function touchDevice(deviceId: string): Promise<void> {
  await unsafeGlobalPrisma.kioskDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date() },
  });
}

/* -------------------------------------------------------------------------- */
/* Koppling med engångskod                                                     */
/* -------------------------------------------------------------------------- */

/**
 * KODEN SOM KOPPLAR EN SKÄRM.
 *
 * Sex siffror, giltiga i fem minuter, knutna till en enda skärm och förbrukade
 * vid användning.
 *
 * Skälet till att det är en kod och inte en länk: den som sätter upp skärmen
 * står framför den med en surfplatta i handen. En länk med trettiotvå
 * slumpade byte går inte att skriva av, så den måste kopieras — vilket kräver
 * att samma person samtidigt har adminpanelen öppen på en annan enhet. Sex
 * siffror läser man från en skärm och knappar in.
 *
 * SÄKERHETEN LIGGER INTE I KODEN, den ligger i tre begränsningar tillsammans:
 *
 *   1. Fem minuters livslängd. En kod som ligger kvar är en väg in.
 *   2. Engångsanvändning. Koden nollas i samma stund den lösts in.
 *   3. Tak på antalet gissningar, per avsändare. Utan det hittar ett skript
 *      en giltig kod bland en miljon kombinationer på några minuter.
 *
 * Fingeravtrycket sparas i stället för koden. Det skyddar föga mot någon som
 * fått tag i databasen — sex siffror prövas igenom på ett ögonblick — men det
 * kostar heller ingenting, och en databaskopia ska aldrig innehålla något som
 * går att använda rakt av.
 */

/** Hur länge en kod gäller. */
export const PAIRING_CODE_MINUTES = 5;

/** Sex siffror, jämnt fördelade. Math.random duger inte till detta. */
function generatePairingCode(): string {
  // randomInt ger ett jämnt fördelat tal utan den snedvridning som uppstår av
  // att ta modulo på ett slumptal. Skillnaden spelar roll när utrymmet är så
  // litet som en miljon.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface PairingCode {
  code: string;
  expiresAt: Date;
}

/**
 * Ger skärmen en ny kod och nollar dess nuvarande token.
 *
 * Används både när en skärm skapas och när den kopplas om. Att token nollas är
 * hela poängen med att koppla om: den gamla enheten slutar fungera i samma
 * stund, utan att någon behöver leta rätt på den.
 *
 * Skärmens historik rörs inte. Det är samma skärm på samma vägg.
 */
export async function startPairing(deviceId: string): Promise<PairingCode> {
  const expiresAt = new Date(Date.now() + PAIRING_CODE_MINUTES * 60 * 1000);

  // Koden är unik i databasen. Krockar den med en annan skärms kod — vilket
  // händer ungefär en gång på en miljon — tas en ny. Tre försök räcker med
  // marginal; misslyckas alla tre är något annat fel.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generatePairingCode();

    try {
      await unsafeGlobalPrisma.kioskDevice.update({
        where: { id: deviceId },
        data: {
          tokenHash: null,
          pairingCodeHash: hashToken(code),
          pairingExpiresAt: expiresAt,
        },
      });

      return { code, expiresAt };
    } catch (error) {
      const conflict = (error as { code?: string } | null)?.code === "P2002";
      if (!conflict) throw error;
    }
  }

  throw new Error("Kunde inte skapa en unik kopplingskod.");
}

/**
 * Löser in en kod och ger skärmen en riktig token.
 *
 * Anroparen ANSVARAR för att begränsa antalet försök innan den här funktionen
 * anropas — se pairDevice i src/app/kiosk/actions.ts. Utan det skyddet är sex
 * siffror inte tillräckligt.
 */
export async function redeemPairingCode(
  code: string
): Promise<{ token: string; session: KioskSession } | null> {
  const trimmed = code.replace(/\D/g, "");
  if (trimmed.length !== 6) return null;

  const device = await unsafeGlobalPrisma.kioskDevice.findUnique({
    where: { pairingCodeHash: hashToken(trimmed) },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!device || !device.pairingExpiresAt) return null;
  if (device.pairingExpiresAt < new Date()) return null;

  const token = generateDeviceToken();

  // Koden nollas i samma skrivning som token sätts. Två skärmar som matar in
  // samma kod samtidigt kan därmed inte båda lyckas: den andra hittar ingen
  // rad att uppdatera.
  const claimed = await unsafeGlobalPrisma.kioskDevice.updateMany({
    where: { id: device.id, pairingCodeHash: hashToken(trimmed) },
    data: {
      tokenHash: hashToken(token),
      pairingCodeHash: null,
      pairingExpiresAt: null,
      lastSeenAt: new Date(),
    },
  });

  if (claimed.count === 0) return null;

  return {
    token,
    session: {
      deviceId: device.id,
      deviceName: device.name,
      companyId: device.company.id,
      companyName: device.company.name,
    },
  };
}

/**
 * Kopplar loss skärmen från insidan.
 *
 * Nollar token på servern, inte bara cookien. En cookie som bara raderas
 * lämnar en giltig token kvar i databasen, och den som råkat kopiera den skulle
 * kunna fortsätta använda den. Skärmen hamnar därmed i väntande läge och
 * behöver en ny kod, precis som vid koppla om.
 */
export async function unpairDevice(deviceId: string): Promise<void> {
  await unsafeGlobalPrisma.kioskDevice.updateMany({
    where: { id: deviceId },
    data: { tokenHash: null, pairingCodeHash: null, pairingExpiresAt: null },
  });
}

/**
 * Skapar en ny kioskskärm och ger den sin första kod.
 *
 * Skärmen finns i listan direkt, i läget "väntar på koppling". Den upptar
 * därmed en licens från och med att den skapas — vilket är rimligt, eftersom
 * det är kunden som bestämt att den ska finnas.
 */
export async function createKioskDevice(companyId: string, name: string) {
  const device = await unsafeGlobalPrisma.kioskDevice.create({
    data: { companyId, name },
  });

  const pairing = await startPairing(device.id);

  return { device, pairing };
}

/** Läget en skärm befinner sig i. Räknas fram, lagras inte. */
export type DeviceState = "kopplad" | "väntar" | "utgången";

export function deviceState(
  device: { tokenHash: string | null; pairingExpiresAt: Date | null },
  now: Date = new Date()
): DeviceState {
  if (device.tokenHash) return "kopplad";
  if (device.pairingExpiresAt && device.pairingExpiresAt > now) return "väntar";
  return "utgången";
}

/**
 * Förlänger skärmens cookie.
 *
 * Giltighetstiden räknades tidigare från kopplingstillfället och förnyades
 * aldrig. En skärm som suttit på väggen i ett år hade alltså plötsligt bett om
 * att kopplas på nytt, mitt i ett arbetspass, utan att något var fel.
 *
 * Anropas vid varje stämpling. En skärm som används håller sig därmed kopplad
 * hur länge som helst, medan en som stått oanvänd i över ett år får kopplas om
 * — vilket är rimligt, eftersom ingen vet var den befinner sig då.
 */
export async function refreshKioskCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(KIOSK_COOKIE)?.value;
  if (!token) return;

  jar.set(KIOSK_COOKIE, token, kioskCookieOptions());
}
