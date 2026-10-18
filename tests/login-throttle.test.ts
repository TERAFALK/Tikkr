import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  clearFailedLogins,
  isLockedOut,
  noteFailedLogin,
  __resetThrottle,
} from "@/lib/login-throttle";

/**
 * Bromsningen av lösenordsgissningar.
 *
 * bcrypt gör varje enskild gissning långsam, men hindrar inte någon från att
 * hålla på i timmar. Det är den här spärren som gör det. Reglerna som skyddas
 * här: femte försöket låser, låsningen släpper av sig själv, en lyckad
 * inloggning nollställer, och de två panelerna räknas var för sig.
 *
 * Räkningen ligger i databasen sedan 2026-10-18, så att en omstart inte nollar
 * den. Tiden styrs med `now` i stället för låtsade timers, som inte rör
 * databasens klocka.
 */

beforeEach(async () => {
  await __resetThrottle();
});

afterAll(async () => {
  await __resetThrottle();
  await unsafeGlobalPrisma.$disconnect();
});

async function failTimes(scope: string, key: string, times: number, now?: Date) {
  for (let i = 0; i < times; i += 1) {
    await noteFailedLogin(scope, key, now);
  }
}

const minutes = (count: number) => count * 60 * 1000;

describe("låsning efter upprepade försök", () => {
  it("fyra försök låser inte", async () => {
    await failTimes("admin", "chef@mekaniska.se", 4);
    expect(await isLockedOut("admin", "chef@mekaniska.se")).toBe(false);
  });

  it("femte försöket låser", async () => {
    await failTimes("admin", "chef@mekaniska.se", 5);
    expect(await isLockedOut("admin", "chef@mekaniska.se")).toBe(true);
  });

  it("okänd adress är aldrig låst", async () => {
    await failTimes("admin", "chef@mekaniska.se", 5);
    expect(await isLockedOut("admin", "nagon.annan@mekaniska.se")).toBe(false);
  });
});

describe("låsningen släpper", () => {
  it("efter femton minuter", async () => {
    const start = new Date();
    await failTimes("admin", "chef@mekaniska.se", 5, start);

    // Fjorton minuter räcker inte.
    const fourteen = new Date(start.getTime() + minutes(14));
    expect(await isLockedOut("admin", "chef@mekaniska.se", 5, fourteen)).toBe(true);

    const sixteen = new Date(start.getTime() + minutes(16));
    expect(await isLockedOut("admin", "chef@mekaniska.se", 5, sixteen)).toBe(false);
  });

  it("en räkning som löpt ut börjar om från ett", async () => {
    // Annars hade ett enda fel efter en låsning som gått ut låst igen direkt.
    const start = new Date();
    await failTimes("admin", "chef@mekaniska.se", 5, start);

    const later = new Date(start.getTime() + minutes(16));
    await noteFailedLogin("admin", "chef@mekaniska.se", later);

    expect(await isLockedOut("admin", "chef@mekaniska.se", 5, later)).toBe(false);
    expect(await isLockedOut("admin", "chef@mekaniska.se", 1, later)).toBe(true);
  });
});

describe("lyckad inloggning", () => {
  it("nollställer räkningen", async () => {
    await failTimes("admin", "chef@mekaniska.se", 4);
    await clearFailedLogins("admin", "chef@mekaniska.se");
    await noteFailedLogin("admin", "chef@mekaniska.se");

    expect(await isLockedOut("admin", "chef@mekaniska.se")).toBe(false);
  });
});

describe("egna tak", () => {
  it("ett eget tak gäller i stället för fem", async () => {
    // Taket per IP-adress är högre än per konto: en verkstad delar ofta en
    // adress, och tre personer som skriver fel ska inte stänga ute de andra.
    await failTimes("admin-ip", "198.51.100.7", 29);
    expect(await isLockedOut("admin-ip", "198.51.100.7", 30)).toBe(false);

    await noteFailedLogin("admin-ip", "198.51.100.7");
    expect(await isLockedOut("admin-ip", "198.51.100.7", 30)).toBe(true);
  });
});

describe("räkningen ligger i databasen", () => {
  it("adressen sparas inte i klartext", async () => {
    await noteFailedLogin("admin", "chef@mekaniska.se");

    const rows = await unsafeGlobalPrisma.loginThrottle.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].keyHash).not.toContain("mekaniska");
    expect(rows[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rader som löpt ut städas bort", async () => {
    const start = new Date();
    await failTimes("admin", "gammal@example.com", 3, start);

    await noteFailedLogin(
      "admin",
      "ny@example.com",
      new Date(start.getTime() + minutes(16))
    );

    const rows = await unsafeGlobalPrisma.loginThrottle.findMany();
    expect(rows).toHaveLength(1);
  });

  it("två fel i samma ögonblick räknas båda", async () => {
    await Promise.all([
      noteFailedLogin("admin", "samtidig@example.com"),
      noteFailedLogin("admin", "samtidig@example.com"),
    ]);

    expect(await isLockedOut("admin", "samtidig@example.com", 2)).toBe(true);
  });
});

describe("panelerna räknas var för sig", () => {
  it("en låst kundinloggning låser inte plattformspanelen", async () => {
    // Samma person kan ha konto på båda hållen. Att någon gissar på det ena
    // får inte stänga ute den rätta personen från det andra.
    await failTimes("admin", "adi@terafalk.com", 5);

    expect(await isLockedOut("admin", "adi@terafalk.com")).toBe(true);
    expect(await isLockedOut("platform", "adi@terafalk.com")).toBe(false);
  });
});
