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

describe("panelerna räknas var för sig", () => {
  it("en låst kundinloggning låser inte plattformspanelen", () => {
    // Samma person kan ha konto på båda hållen. Att någon gissar på det ena
    // får inte stänga ute den rätta personen från det andra.
    failTimes("admin", "adi@terafalk.com", 5);

    expect(isLockedOut("admin", "adi@terafalk.com")).toBe(true);
    expect(isLockedOut("platform", "adi@terafalk.com")).toBe(false);
  });
});
