import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * KRYPTERING AV HEMLIGHETER I DATABASEN, för annat än tvåstegsnycklarna.
 *
 * Samma upplägg som totp-box.mjs: AES-256-GCM med en nyckel härledd ur
 * AUTH_SECRET, som bara finns i serverns .env. En databaskopia ensam räcker
 * inte, och en ändrad text avslöjas av taggen.
 *
 * `purpose` ger varje användning en egen nyckel. En text krypterad för ett
 * ändamål går inte att öppna som ett annat, och skulle en av dem läcka gäller
 * det bara den.
 *
 * Byts AUTH_SECRET går det som krypterats inte längre att läsa.
 */

const VERSION = "v1";

function keyFor(purpose: string, authSecret: string): Buffer {
  return createHash("sha256").update(`${authSecret}:${purpose}`).digest();
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET saknas.");
  return value;
}

/** Krypterar en text. `authSecret` för tester; annars läses .env. */
export function sealText(
  text: string,
  purpose: string,
  authSecret: string = secret()
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose, authSecret), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/** Dekrypterar, eller null när texten inte går att läsa. */
export function openText(
  sealed: string,
  purpose: string,
  authSecret: string | undefined = process.env.AUTH_SECRET
): string | null {
  if (!sealed || !authSecret) return null;

  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) return null;

  try {
    // Taggens längd uttryckligen, som i totp-box.mjs: annars godtas en
    // avkortad tagg.
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFor(purpose, authSecret),
      Buffer.from(iv, "base64url"),
      { authTagLength: 16 }
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
