import { describe, it, expect } from "vitest";
import {
  KIOSK_SETTINGS,
  KIOSK_SETTING_KEYS,
  isKioskSettingKey,
  parseKioskSetting,
  resolveKioskSettings,
} from "@/lib/kiosk-settings";

/**
 * SKÄRMINSTÄLLNINGARNA, registret och hur nivåerna slås ihop.
 *
 * Det som måste hålla:
 *   kundens värde går före plattformens, som går före registrets
 *   ett ogiltigt eller okänt värde når aldrig en skärm
 *   att stänga av något är ett eget värde, skilt från "inget satt"
 *
 * Behöver ingen databas.
 */

const FALLBACK = Object.fromEntries(
  KIOSK_SETTING_KEYS.map((key) => [key, KIOSK_SETTINGS[key].fallback])
);

describe("nivåerna", () => {
  it("utan rader gäller registrets värden", () => {
    expect(resolveKioskSettings({}, {})).toEqual(FALLBACK);
  });

  it("plattformens standard går före registret", () => {
    expect(
      resolveKioskSettings({ screensaverMinutes: "30" }, {}).screensaverMinutes
    ).toBe("30");
  });

  it("kundens värde går före plattformens", () => {
    expect(
      resolveKioskSettings(
        { screensaverMinutes: "30" },
        { screensaverMinutes: "5" }
      ).screensaverMinutes
    ).toBe("5");
  });

  it("ett kundvärde rör bara sin egen inställning", () => {
    const resolved = resolveKioskSettings(
      { screensaverMinutes: "30", dailyRestart: "04:00" },
      { screensaverMinutes: "5" }
    );
    expect(resolved.dailyRestart).toBe("04:00");
  });

  it("en avstängd omstart hos kunden går före standardens klockslag", () => {
    // Tom text är "av", inte "inget satt". Hade den tolkats som saknad hade
    // kunden fått standardens omstart mot sin vilja.
    expect(
      resolveKioskSettings({ dailyRestart: "03:00" }, { dailyRestart: "" })
        .dailyRestart
    ).toBe("");
  });

  it("ett ogiltigt värde i databasen faller tillbaka i stället för att nå skärmen", () => {
    const resolved = resolveKioskSettings(
      { screensaverMinutes: "30" },
      { screensaverMinutes: "många", screensaverBrightness: "500" }
    );
    expect(resolved.screensaverMinutes).toBe("30");
    expect(resolved.screensaverBrightness).toBe(
      KIOSK_SETTINGS.screensaverBrightness.fallback
    );
  });

  it("okända nycklar följer aldrig med", () => {
    const resolved = resolveKioskSettings({ kioskPin: "1234" }, { startURL: "x" });
    expect(Object.keys(resolved).sort()).toEqual([...KIOSK_SETTING_KEYS].sort());
  });
});

describe("det som skrivs in", () => {
  it("skärmsläckaren tar hela minuter, och 0 stänger av", () => {
    expect(parseKioskSetting("screensaverMinutes", " 15 ")).toEqual({ value: "15" });
    expect(parseKioskSetting("screensaverMinutes", "0")).toEqual({ value: "0" });
    expect(KIOSK_SETTINGS.screensaverMinutes.describe("0")).toBe("Av");
    expect(parseKioskSetting("screensaverMinutes", "1,5")).toHaveProperty("error");
    expect(parseKioskSetting("screensaverMinutes", "-1")).toHaveProperty("error");
  });

  it("ljusstyrkan är procent", () => {
    expect(parseKioskSetting("screensaverBrightness", "100")).toEqual({ value: "100" });
    expect(parseKioskSetting("screensaverBrightness", "101")).toHaveProperty("error");
  });

  it("omstarten tar ett klockslag och skriver det med två siffror", () => {
    expect(parseKioskSetting("dailyRestart", "3:00")).toEqual({ value: "03:00" });
    expect(parseKioskSetting("dailyRestart", "03.30")).toEqual({ value: "03:30" });
    expect(parseKioskSetting("dailyRestart", "24:00")).toHaveProperty("error");
    expect(parseKioskSetting("dailyRestart", "3")).toHaveProperty("error");
  });

  it("omstarten stängs av med ordet av", () => {
    expect(parseKioskSetting("dailyRestart", "Av")).toEqual({ value: "" });
    expect(KIOSK_SETTINGS.dailyRestart.describe("")).toBe("Av");
  });

  it("känner bara sina egna nycklar", () => {
    expect(isKioskSettingKey("screensaverMinutes")).toBe(true);
    expect(isKioskSettingKey("kioskPin")).toBe(false);
    expect(isKioskSettingKey("startURL")).toBe(false);
  });

  it("registrets egna värden är giltiga", () => {
    for (const key of KIOSK_SETTING_KEYS) {
      expect(parseKioskSetting(key, KIOSK_SETTINGS[key].fallback)).toEqual({
        value: KIOSK_SETTINGS[key].fallback,
      });
    }
  });
});
