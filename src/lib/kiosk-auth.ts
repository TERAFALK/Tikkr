import { createHash, randomBytes } from "node:crypto";
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
 * 2. Token står bara i länken vid engångsuppsättningen. Direkt efter flyttas
 *    den till en cookie och försvinner ur adressfältet. Adresser läcker lätt —
 *    via webbläsarhistorik, serverloggar, eller att någon skickar länken
 *    vidare — medan en cookie stannar i skärmens webbläsare.
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

  // En återkallad skärm slutar fungera omedelbart, utan att någon behöver
  // ändra något på själva skärmen.
  if (!device || !device.active) return null;

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

/**
 * Skapar en ny kioskskärm och lämnar tillbaka dess token EN gång.
 *
 * Token går inte att få fram igen efteråt — bara fingeravtrycket sparas.
 * Tappas den bort skapar man en ny skärm och återkallar den gamla.
 */
export async function createKioskDevice(companyId: string, name: string) {
  const token = generateDeviceToken();

  const device = await unsafeGlobalPrisma.kioskDevice.create({
    data: { companyId, name, tokenHash: hashToken(token) },
  });

  return { device, token };
}
