import { createHash, randomBytes } from "node:crypto";
import { unsafeGlobalPrisma } from "../db";
import { forCompany } from "../tenant";

/**
 * IDENTIFIERING AV EN TIKKR GATEWAY.
 *
 * Samma konstruktion som kioskens token (kiosk-auth.ts): en lång slumpad
 * hemlighet som bara sparas som SHA-256. Den går inte att gissa, och en
 * databaskopia går inte att använda.
 *
 * Vägen dit går i två steg. Administratören skapar en ENGÅNGSTOKEN i panelen
 * och skriver in den i installationen. Gatewayen löser in den mot en
 * PERMANENT nyckel, som den sparar krypterad hos kunden. Token är förbrukad
 * vid första användningen och gäller ett dygn, så att en token i ett mejl
 * eller ett RMM-skript inte blir en öppen dörr.
 *
 * Prefixen (tgr_, tgk_) gör att en hemlighet som hamnat i en logg eller ett
 * repo går att känna igen, också av gitleaks.
 */

export const REGISTRATION_TOKEN_HOURS = 24;
const TOKEN_PREFIX = "tgr_";
const KEY_PREFIX = "tgk_";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateRegistrationToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString("base64url");
}

export function generateGatewayKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

/**
 * Skapar en engångstoken. Returnerar den i klartext EN gång; därefter finns
 * bara fingeravtrycket.
 */
export async function createRegistrationToken(
  companyId: string,
  createdByEmail: string,
  now = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateRegistrationToken();
  const expiresAt = new Date(now.getTime() + REGISTRATION_TOKEN_HOURS * 3600_000);
  await forCompany(companyId).gatewayRegistrationToken.create({
    data: { companyId, tokenHash: hashSecret(token), expiresAt, createdByEmail },
  });
  return { token, expiresAt };
}

export type RedeemResult =
  | { ok: true; gatewayId: string; companyId: string; gatewayKey: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Löser in en engångstoken mot en gateway och dess permanenta nyckel.
 *
 * Uppslaget går genom unsafeGlobalPrisma, eftersom företaget inte är känt
 * förrän token hittats; samma undantag som kioskens. Förbrukningen är ett
 * villkorat update, så att två samtidiga försök med samma token inte kan ge
 * två gatewayer.
 */
export async function redeemRegistrationToken(
  token: string,
  report: { machineName: string; version: string },
  now = new Date()
): Promise<RedeemResult> {
  const row = await unsafeGlobalPrisma.gatewayRegistrationToken.findUnique({
    where: { tokenHash: hashSecret(token) },
  });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };

  const gatewayKey = generateGatewayKey();
  const db = forCompany(row.companyId);

  const gatewayId = await db.$transaction(async (tx) => {
    const claimed = await tx.gatewayRegistrationToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;

    const gateway = await tx.gateway.create({
      data: {
        companyId: row.companyId,
        keyHash: hashSecret(gatewayKey),
        machineName: report.machineName,
        version: report.version,
        lastHeartbeatAt: now,
      },
    });

    // Integrationer som väntar på en gateway får den här. En arbetsyta med
    // flera gatewayer pekar ut vilken i panelen.
    await tx.integration.updateMany({
      where: { connectionType: "GATEWAY", gatewayId: null },
      data: { gatewayId: gateway.id },
    });

    await tx.integrationEvent.create({
      data: {
        companyId: row.companyId,
        gatewayId: gateway.id,
        message: `Gateway registrerad på ${report.machineName}.`,
        details: { version: report.version },
      },
    });

    return gateway.id;
  });

  if (!gatewayId) return { ok: false, reason: "used" };
  return { ok: true, gatewayId, companyId: row.companyId, gatewayKey };
}

export interface GatewaySession {
  gatewayId: string;
  companyId: string;
}

/** Läser `Authorization: Bearer tgk_…` och slår upp gatewayen. */
export async function resolveGatewayKey(
  authorization: string | null
): Promise<GatewaySession | null> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  const key = match?.[1];
  if (!key || !key.startsWith(KEY_PREFIX)) return null;

  const gateway = await unsafeGlobalPrisma.gateway.findUnique({
    where: { keyHash: hashSecret(key) },
    select: { id: true, companyId: true },
  });
  return gateway ? { gatewayId: gateway.id, companyId: gateway.companyId } : null;
}

/* -------------------------------------------------------------------------- */
/* Anropsbegränsning per gateway                                               */
/* -------------------------------------------------------------------------- */

/**
 * Högst så här många anrop per minut och gateway.
 *
 * I minnet och inte i databasen, till skillnad från bromsarna mot gissning
 * (login-throttle.ts). Nyckeln går inte att gissa, så det här skyddar inte mot
 * intrång utan mot en gateway som gått i loop, och att räkningen börjar om vid
 * en driftsättning spelar då ingen roll.
 */
export const GATEWAY_REQUESTS_PER_MINUTE = 120;

const windows = new Map<string, { start: number; count: number }>();

export function allowGatewayRequest(gatewayId: string, now = Date.now()): boolean {
  const current = windows.get(gatewayId);
  if (!current || now - current.start >= 60_000) {
    windows.set(gatewayId, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [key, value] of windows) {
        if (now - value.start >= 60_000) windows.delete(key);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= GATEWAY_REQUESTS_PER_MINUTE;
}

/** Nollställer räkningen. Används av testerna. */
export function __resetGatewayRateLimit(): void {
  windows.clear();
}
