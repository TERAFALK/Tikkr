import { enrollmentFor as enroll, type Enrollment } from "@terafalk/auth/two-step";

export { newTotpSecret, qrSvg, type Enrollment } from "@terafalk/auth/two-step";

/** Det som visas när appen ska sättas upp. Se @terafalk/auth. */
export function enrollmentFor(label: string, secret: Buffer): Enrollment {
  return enroll(label, secret, "Tikkr");
}
