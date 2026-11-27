import { describe, it, expect } from "vitest";
import { linkState } from "@/lib/email-verification";

/**
 * LÄNKEN I BEKRÄFTELSEMEJLET BEKRÄFTAR FÖRST NÄR NÅGON TRYCKER.
 *
 * Till v1.0.2 bekräftades adressen redan när sidan visades. Microsofts Safe
 * Links öppnar varje länk i ett inkommande mejl innan mottagaren ser det, och
 * förbrukade därmed länken: den som sedan klickade fick "Länken fungerar
 * inte", fast adressen var bekräftad. Hänt i produktionen 2026-11-27, där
 * skannern löste in länken 14 sekunder efter utskicket.
 *
 * Nu visar sidan en knapp, och läget härleds här utan att något skrivs. Det
 * viktiga är de två sista fallen: en adress som redan är bekräftad är aldrig
 * ett fel, vem som än löste in länken.
 */

const NOW = new Date("2026-11-27T13:00:00Z");
const LATER = new Date("2026-12-04T13:00:00Z");
const EARLIER = new Date("2026-11-27T12:00:00Z");

function row(overrides: {
  usedAt?: Date | null;
  expiresAt?: Date;
  email?: string;
  userEmail?: string;
  verifiedAt?: Date | null;
}) {
  return {
    usedAt: overrides.usedAt ?? null,
    expiresAt: overrides.expiresAt ?? LATER,
    email: overrides.email ?? "chef@verkstad.se",
    user: {
      email: overrides.userEmail ?? "chef@verkstad.se",
      emailVerifiedAt: overrides.verifiedAt ?? null,
    },
  };
}

describe("länkens läge", () => {
  it("en oanvänd länk väntar på knappen", () => {
    expect(linkState(row({}), NOW)).toEqual({
      kind: "ready",
      email: "chef@verkstad.se",
    });
  });

  it("en okänd länk fungerar inte", () => {
    expect(linkState(null, NOW)).toEqual({ kind: "invalid" });
  });

  it("en utgången länk fungerar inte", () => {
    expect(linkState(row({ expiresAt: EARLIER }), NOW)).toEqual({
      kind: "invalid",
    });
  });

  it("en länk till en adress som sedan bytts fungerar inte", () => {
    expect(
      linkState(row({ userEmail: "ny@verkstad.se", verifiedAt: NOW }), NOW)
    ).toEqual({ kind: "invalid" });
  });

  it("en länk som en skanner redan löst in visar att adressen är bekräftad", () => {
    expect(linkState(row({ usedAt: EARLIER, verifiedAt: EARLIER }), NOW)).toEqual(
      { kind: "confirmed", email: "chef@verkstad.se" }
    );
  });

  it("en utgången länk till en bekräftad adress visar också att den är bekräftad", () => {
    expect(
      linkState(row({ expiresAt: EARLIER, verifiedAt: EARLIER }), NOW)
    ).toEqual({ kind: "confirmed", email: "chef@verkstad.se" });
  });
});
