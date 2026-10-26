import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  kioskSettingsFor,
  setCompanyKioskSetting,
  setKioskDefault,
} from "@/lib/kiosk-settings-store";
import { KIOSK_SETTINGS } from "@/lib/kiosk-settings";

/**
 * SKÄRMINSTÄLLNINGARNA I DATABASEN.
 *
 * Det som måste hålla:
 *   en kunds eget värde når bara den kundens skärmar
 *   ett tomt fält tar bort raden, och nivån ovanför gäller igen
 *   ett ogiltigt värde sparas inte
 */

let a: string;
let b: string;

beforeEach(async () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  a = (await unsafeGlobalPrisma.company.create({ data: { name: `Skärm A ${suffix}` } })).id;
  b = (await unsafeGlobalPrisma.company.create({ data: { name: `Skärm B ${suffix}` } })).id;
  await unsafeGlobalPrisma.kioskSettingDefault.deleteMany({});
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({ where: { id: { in: [a, b] } } });
  await unsafeGlobalPrisma.kioskSettingDefault.deleteMany({});
});

describe("skärminställningar", () => {
  it("standarden når alla kunder", async () => {
    await setKioskDefault({ key: "screensaverMinutes", raw: "30", byEmail: "vi@tikkr.se" });

    expect((await kioskSettingsFor(a)).screensaverMinutes).toBe("30");
    expect((await kioskSettingsFor(b)).screensaverMinutes).toBe("30");
  });

  it("en kunds eget värde når bara den kunden", async () => {
    await setKioskDefault({ key: "screensaverMinutes", raw: "30", byEmail: "vi@tikkr.se" });
    await setCompanyKioskSetting({
      companyId: a,
      key: "screensaverMinutes",
      raw: "5",
      byEmail: "vi@tikkr.se",
    });

    expect((await kioskSettingsFor(a)).screensaverMinutes).toBe("5");
    expect((await kioskSettingsFor(b)).screensaverMinutes).toBe("30");
  });

  it("att ta bort kundens värde ger standarden tillbaka", async () => {
    await setKioskDefault({ key: "dailyRestart", raw: "04:00", byEmail: "vi@tikkr.se" });
    await setCompanyKioskSetting({ companyId: a, key: "dailyRestart", raw: "av", byEmail: "vi@tikkr.se" });
    expect((await kioskSettingsFor(a)).dailyRestart).toBe("");

    await setCompanyKioskSetting({ companyId: a, key: "dailyRestart", raw: null, byEmail: "vi@tikkr.se" });
    expect((await kioskSettingsFor(a)).dailyRestart).toBe("04:00");
  });

  it("att ta bort standarden ger Tikkrs eget värde tillbaka", async () => {
    await setKioskDefault({ key: "screensaverBrightness", raw: "50", byEmail: "vi@tikkr.se" });
    await setKioskDefault({ key: "screensaverBrightness", raw: null, byEmail: "vi@tikkr.se" });

    expect((await kioskSettingsFor(a)).screensaverBrightness).toBe(
      KIOSK_SETTINGS.screensaverBrightness.fallback
    );
  });

  it("ett ogiltigt värde sparas inte", async () => {
    const result = await setCompanyKioskSetting({
      companyId: a,
      key: "screensaverBrightness",
      raw: "300",
      byEmail: "vi@tikkr.se",
    });

    expect(result).toHaveProperty("error");
    expect(
      await unsafeGlobalPrisma.companyKioskSetting.count({ where: { companyId: a } })
    ).toBe(0);
  });

  it("raderas med företaget", async () => {
    await setCompanyKioskSetting({ companyId: a, key: "screensaverMinutes", raw: "5", byEmail: "vi@tikkr.se" });
    await unsafeGlobalPrisma.company.delete({ where: { id: a } });

    expect(
      await unsafeGlobalPrisma.companyKioskSetting.count({ where: { companyId: a } })
    ).toBe(0);
  });
});
