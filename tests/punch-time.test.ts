import { describe, it, expect } from "vitest";
import {
  MAX_CLOCK_SKEW_MS,
  MAX_QUEUE_AGE_MS,
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
