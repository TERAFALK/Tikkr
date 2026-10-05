import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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
 */

beforeEach(() => {
  __resetThrottle();
});

afterEach(() => {
  vi.useRealTimers();
});

function failTimes(scope: string, email: string, times: number) {
  for (let i = 0; i < times; i += 1) {
    noteFailedLogin(scope, email);
  }
}

describe("låsning efter upprepade försök", () => {
  it("fyra försök låser inte", () => {
    failTimes("admin", "chef@mekaniska.se", 4);
    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(false);
  });

  it("femte försöket låser", () => {
    failTimes("admin", "chef@mekaniska.se", 5);
    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(true);
  });

  it("okänd adress är aldrig låst", () => {
    failTimes("admin", "chef@mekaniska.se", 5);
    expect(isLockedOut("admin", "nagon.annan@mekaniska.se")).toBe(false);
  });
});

describe("låsningen släpper", () => {
  it("efter femton minuter", () => {
    vi.useFakeTimers();

    failTimes("admin", "chef@mekaniska.se", 5);
    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(true);

    // Fjorton minuter räcker inte.
    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(true);

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(false);
  });

  it("varje nytt försök förlänger låsningen", () => {
    vi.useFakeTimers();

    failTimes("admin", "chef@mekaniska.se", 5);

    vi.advanceTimersByTime(14 * 60 * 1000);
    noteFailedLogin("admin", "chef@mekaniska.se");

    // Utan förlängningen hade låsningen släppt en minut senare, och den som
    // fortsätter gissa hade fått en ny omgång var femtonde minut i evighet.
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(true);
  });

  it("efter en lyckad inloggning", () => {
    failTimes("admin", "chef@mekaniska.se", 5);
    clearFailedLogins("admin", "chef@mekaniska.se");

    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(false);
  });
});

describe("gemensamma räknare", () => {
  it("ett eget tak gäller i stället för fem", () => {
    // Taket för kopplingskoder gäller hela installationen. Fem fel i hela
    // landet får inte låsa alla kunders skärmkopplingar.
    failTimes("kiosk-pairing-global", "*", 99);
    expect(isLockedOut("kiosk-pairing-global", "*", 100)).toBe(false);

    noteFailedLogin("kiosk-pairing-global", "*");
    expect(isLockedOut("kiosk-pairing-global", "*", 100)).toBe(true);
  });
});

describe("minnet har ett tak", () => {
  it("en ny nyckel per anrop fyller inte minnet, och den senaste räknas", () => {
    // Nycklarna kommer utifrån. Utan tak kunde den som skickade en ny adress
    // vid varje anrop fylla minnet tills processen dog.
    for (let i = 0; i < 10_050; i += 1) {
      noteFailedLogin("admin", `gissning-${i}@example.com`);
    }

    failTimes("admin", "chef@mekaniska.se", 5);
    expect(isLockedOut("admin", "chef@mekaniska.se")).toBe(true);

    // Den äldsta har fått ge plats.
    expect(isLockedOut("admin", "gissning-0@example.com", 1)).toBe(false);
  });
});

describe("panelerna räknas var för sig", () => {
  it("en låst kundinloggning låser inte plattformspanelen", () => {
    // Samma person kan ha konto på båda hållen. Att någon gissar på det ena
    // får inte stänga ute den rätta personen från det andra.
    failTimes("admin", "adi@terafalk.com", 5);

    expect(isLockedOut("admin", "adi@terafalk.com")).toBe(true);
    expect(isLockedOut("platform", "adi@terafalk.com")).toBe(false);
  });
});
