// KRYPTERING AV TVÅSTEGSNYCKLARNA.
//
// Nyckeln i autentiseringsappen är en hemlighet som gäller för alltid. Låg den
// i klartext i databasen räckte en databaskopia för att räkna fram varje kod.
// Den krypteras därför med en nyckel härledd ur AUTH_SECRET, som bara finns i
// .env — samma tanke som resten av plattformsinloggningen: databasen ensam och
// servern ensam räcker inte, båda krävs. Se platform-auth.ts.
//
// Gäller både kundernas och plattformens nycklar. Vanlig JavaScript, så att
// ett skript som körs med node direkt kan läsa samma format som appen.
//
// Byts AUTH_SECRET går nycklarna inte längre att läsa, och alla måste sätta
// upp appen på nytt.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Byte till nyckeln som den skrivs in i appen ("JBSWY3DP…").
 *
 * Här och inte i totp.ts, så att skriptet som visar nyckeln och appen som
 * läser den använder samma kodning. totp.ts exporterar om den.
 *
 * @param {Buffer} data
 * @returns {string}
 */
export function base32Encode(data) {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of data) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** @param {string} authSecret */
function keyFrom(authSecret) {
  return createHash("sha256").update(`${authSecret}:platform-totp`).digest();
}

/**
 * Krypterar nyckeln. AES-256-GCM, som också avslöjar om texten ändrats.
 *
 * @param {Buffer} secret
 * @param {string} authSecret
 * @returns {string}
 */
export function sealSecret(secret, authSecret) {
  if (!authSecret) throw new Error("AUTH_SECRET saknas.");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(authSecret), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/**
 * Dekrypterar nyckeln, eller null när den inte går att läsa.
 *
 * @param {string} sealed
 * @param {string} authSecret
 * @returns {Buffer | null}
 */
export function openSecret(sealed, authSecret) {
  if (!sealed || !authSecret) return null;

  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFrom(authSecret),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}
