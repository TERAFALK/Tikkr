import { randomBytes } from "node:crypto";
import qrcode from "qrcode-generator";
import { base32Encode } from "./totp";

/**
 * UPPSÄTTNINGEN AV TVÅSTEGSINLOGGNING, gemensam för kunder och plattform.
 *
 * Samma flöde på båda hållen (beslutat 2026-10-06): efter lösenordet visas en
 * QR-kod som skannas med valfri autentiseringsapp, och den första koden appen
 * visar bekräftar att den är uppsatt. Nyckeln står också i klartext under
 * koden, för den som inte kan skanna.
 *
 * Allt här är standard: SHA-1, sex siffror, trettio sekunder. Det är vad
 * Microsoft Authenticator, Google Authenticator, 1Password och de andra
 * förväntar sig utan inställningar. Se totp.ts.
 */

export interface Enrollment {
  /** Nyckeln i grupper om fyra, att skriva av för hand. */
  key: string;
  /** Länken QR-koden bär. Öppnar appen direkt på en telefon. */
  uri: string;
  /** QR-koden som SVG, klar att rita. */
  qrSvg: string;
}

/** En ny nyckel. 20 byte, vad RFC 6238 rekommenderar för SHA-1. */
export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

/**
 * Det som visas när appen ska sättas upp.
 *
 * `label` är det appen visar under koden, oftast e-postadressen. Utfärdaren
 * står med både i namnet och som parameter: äldre appar läser det ena, nyare
 * det andra.
 */
export function enrollmentFor(label: string, secret: Buffer): Enrollment {
  const key = base32Encode(secret);

  const uri =
    `otpauth://totp/${encodeURIComponent(`Tikkr:${label}`)}` +
    `?secret=${key}&issuer=Tikkr&algorithm=SHA1&digits=6&period=30`;

  return {
    key: key.match(/.{1,4}/g)?.join(" ") ?? key,
    uri,
    qrSvg: qrSvg(uri),
  };
}

/**
 * En QR-kod som SVG.
 *
 * Felkorrigering M tål en repa eller en reflex i skärmen. Typnummer 0 låter
 * biblioteket välja storlek efter innehållet. Skalbar, så att den ritas i den
 * storlek sidan ger den.
 */
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}
