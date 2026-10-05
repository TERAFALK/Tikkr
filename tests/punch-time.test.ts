import { describe, it, expect } from "vitest";
import {
  MAX_CLOCK_SKEW_MS,
  MAX_QUEUE_AGE_MS,
  MAX_TRUSTED_OFFSET_MS,
  readPunchTime,
} from "@/lib/punch-time";

/**
 * Tiden skärmen uppger.
 *
 * Den viktigaste regeln: ETT TRYCK FÅR ALDRIG AVVISAS för att klockan är fel.
 * Offline-kön kastar allt som får 4xx, så ett avvisat tryck är arbetstid som
 * försvinner och inte går att rekonstruera. En orimlig tid ska därför landa
 * på serverns klocka och flaggas för granskning — aldrig tas bort.
 */

const now = new Date("2026-09-27T10:00:00Z");

describe("readPunchTime", () => {
  it("släpper igenom en rimlig tid orörd", () => {
    const at = new Date("2026-09-27T09:30:00Z");
    const result = readPunchTime(at.toISOString(), now);

    expect(result.at?.toISOString()).toBe(at.toISOString());
    expect(result.rejectedAt).toBeUndefined();
  });

  it("låter servertiden gälla när ingen tid angetts", () => {
    const result = readPunchTime(undefined, now);

    expect(result.at).toBeUndefined();
    expect(result.rejectedAt).toBeUndefined();
  });

  it("godtar en liten avvikelse framåt — klockor går isär", () => {
    const at = new Date(now.getTime() + MAX_CLOCK_SKEW_MS - 1000);
    const result = readPunchTime(at.toISOString(), now);

    expect(result.at?.toISOString()).toBe(at.toISOString());
    expect(result.rejectedAt).toBeUndefined();
  });

  it("godtar ett köat tryck som legat kvar länge men inte för länge", () => {
    const at = new Date(now.getTime() - MAX_QUEUE_AGE_MS + 60_000);
    const result = readPunchTime(at.toISOString(), now);

    expect(result.at?.toISOString()).toBe(at.toISOString());
    expect(result.rejectedAt).toBeUndefined();
  });

  it("flaggar en tid i framtiden i stället för att avvisa trycket", () => {
    const at = new Date(now.getTime() + 2 * MAX_CLOCK_SKEW_MS);
    const result = readPunchTime(at.toISOString(), now);

    // Ingen tid tillbaka betyder att servertiden gäller.
    expect(result.at).toBeUndefined();
    expect(result.rejectedAt).toBeTruthy();
  });

  it("flaggar en klocka som står på fel årtionde", () => {
    // Det här är fallet med tomt klockbatteri efter ett strömavbrott.
    const result = readPunchTime("1970-01-01T00:00:00.000Z", now);

    expect(result.at).toBeUndefined();
    expect(result.rejectedAt).toContain("1970");
  });

  it("flaggar en tid som inte går att tolka alls", () => {
    const result = readPunchTime("inte-en-tid", now);

    expect(result.at).toBeUndefined();
    expect(result.rejectedAt).toBe("inte-en-tid");
  });

  it("kapar en orimligt lång sträng innan den hamnar i noten", () => {
    const result = readPunchTime("x".repeat(500), now);

    expect(result.rejectedAt).toBeTruthy();
    expect(result.rejectedAt!.length).toBeLessThanOrEqual(40);
  });

  it("returnerar aldrig något som betyder att trycket ska kastas", () => {
    // Se nedan för fallen med avsändningstid.
    const fall = [
      undefined,
      "2026-09-27T09:30:00Z",
      "2099-01-01T00:00:00Z",
      "1970-01-01T00:00:00Z",
      "inte-en-tid",
      "",
    ];

    for (const raw of fall) {
      const result = readPunchTime(raw, now);
      expect(result).not.toBeNull();
      expect(result).toBeTypeOf("object");
    }
  });
});

/**
 * Skärmens klocka MÄTS.
 *
 * Skärmen skickar både när trycket gjordes och när anropet skickades, enligt
 * samma klocka. Skillnaden mot serverns klocka är hur fel skärmen går, och samma
 * fel ligger i trycktiden. Förr godtogs en klocka som låg upp till fjorton dagar
 * efter utan flagga, och en dags arbete hamnade på fel datum.
 */
describe("readPunchTime med avsändningstid", () => {
  it("en klocka som går rätt lämnar tiden orörd och oflaggad", () => {
    const at = new Date(now.getTime() - 30 * 60 * 1000);
    const sent = new Date(now.getTime() - 1500); // restiden

    const result = readPunchTime(at.toISOString(), now, sent.toISOString());

    expect(result.at?.toISOString()).toBe(at.toISOString());
    expect(result.clockNote).toBeUndefined();
    expect(result.rejectedAt).toBeUndefined();
  });

  it("ett köat tryck från en klocka som går rätt behåller sin tid", () => {
    // Tre timmar utan nät. Klockan är rätt, alltså är trycktiden rätt.
    const at = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const result = readPunchTime(at.toISOString(), now, now.toISOString());

    expect(result.at?.toISOString()).toBe(at.toISOString());
    expect(result.clockNote).toBeUndefined();
  });

  it("en klocka tre dygn efter rättas och flaggas", () => {
    // Surfplattan har startat om efter ett strömavbrott och tror att det är
    // tre dagar tidigare. Trycket gjordes för en minut sedan.
    const offset = 3 * 24 * 60 * 60 * 1000;
    const skewedNow = new Date(now.getTime() - offset);
    const skewedAt = new Date(skewedNow.getTime() - 60_000);

    const result = readPunchTime(
      skewedAt.toISOString(),
      now,
      skewedNow.toISOString()
    );

    expect(result.at?.toISOString()).toBe(
      new Date(now.getTime() - 60_000).toISOString()
    );
    expect(result.clockNote).toBeTruthy();
    expect(result.rejectedAt).toBeUndefined();
  });

  it("en klocka som går före rättas också", () => {
    const offset = -2 * 60 * 60 * 1000;
    const skewedNow = new Date(now.getTime() - offset);

    const result = readPunchTime(
      skewedNow.toISOString(),
      now,
      skewedNow.toISOString()
    );

    expect(result.at?.toISOString()).toBe(now.toISOString());
    expect(result.clockNote).toBeTruthy();
  });

  it("en avvikelse inom två minuter räknas som restid och rättas inte", () => {
    const sent = new Date(now.getTime() - MAX_TRUSTED_OFFSET_MS + 1000);
    const at = new Date(sent.getTime() - 1000);

    const result = readPunchTime(at.toISOString(), now, sent.toISOString());

    expect(result.at?.toISOString()).toBe(at.toISOString());
    expect(result.clockNote).toBeUndefined();
  });

  it("en rättad tid som ändå hamnar orimligt flaggas och servertiden gäller", () => {
    // Trycket säger sig vara tjugo dagar äldre än avsändningen. Ingen kö
    // ligger så länge, så rättningen kan inte lita på någonting.
    const sent = now;
    const at = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

    const result = readPunchTime(at.toISOString(), now, sent.toISOString());

    expect(result.at).toBeUndefined();
    expect(result.rejectedAt).toBeTruthy();
  });

  it("en avsändningstid som inte går att tolka ignoreras", () => {
    const at = new Date("2026-09-27T09:30:00Z");

    const result = readPunchTime(at.toISOString(), now, "trasig");

    expect(result.at?.toISOString()).toBe(at.toISOString());
    expect(result.clockNote).toBeUndefined();
  });
});
