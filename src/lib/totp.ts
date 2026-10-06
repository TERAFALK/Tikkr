import { createHmac, timingSafeEqual } from "node:crypto";
import { base32Encode } from "./totp-box.mjs";

export { base32Encode };

/**
 * KODER FRÅN EN AUTENTISERINGSAPP (TOTP, RFC 6238).
 *
 * Plattformspanelen ser alla kunders driftdata och kan öppna en kunds panel.
 * Ett lösenord ensamt räckte för att komma in, och ett lösenord går att stjäla
 * eller gissa. Med en kod från telefonen krävs dessutom telefonen.
 *
 * Skrivet här i stället för hämtat som ett paket: algoritmen är tjugo rader
 * standard, och ett beroende i inloggningen är ett beroende som kan bytas ut
 * under fötterna på oss. Testerna kör RFC:ns egna exempel.
 *
 * Samma inställningar som alla vanliga appar använder: SHA-1, sex siffror,
 * trettio sekunder. Ändras något av dem slutar koderna i appen att stämma.
 */

export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;

/**
 * Hur många perioder bakåt och framåt en kod godtas.
 *
 * En period åt vardera hållet: telefonens klocka går sällan exakt rätt, och
 * den som skrev av koden i sista sekunden ska inte få fel.
 */
const WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Nyckeln som den står i appen ("JBSW Y3DP…") till byte. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Ogiltigt tecken i nyckeln.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/** Perioden en tidpunkt ligger i. */
export function stepAt(time: Date): number {
  return Math.floor(time.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** Koden för en period, med inledande nollor. */
export function codeForStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Prövar en kod. Svarar med perioden den gällde, eller null.
 *
 * `lastStep` är den senast godkända perioden för kontot. En kod som redan
 * använts godtas inte igen: den som tittade över axeln eller fångade
 * inloggningen ska inte kunna använda samma kod en gång till inom samma
 * halvminut.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  time: Date,
  lastStep: number | null
): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;

  const now = stepAt(time);

  for (let delta = -WINDOW; delta <= WINDOW; delta += 1) {
    const step = now + delta;
    if (lastStep !== null && step <= lastStep) continue;

    const expected = Buffer.from(codeForStep(secret, step));
    if (timingSafeEqual(expected, Buffer.from(given))) return step;
  }

  return null;
}
