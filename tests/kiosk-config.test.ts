import { describe, it, expect } from "vitest";
import {
  CONFIG_MARKER,
  buildConfigFile,
  configWarnings,
  isSecretKey,
  markerFor,
  parseConfigUpload,
  resolveConfigId,
  versionFromMarker,
  type ConfigParts,
} from "@/lib/kiosk-config";

/**
 * KONFIGURATIONERNA, utan databas.
 *
 * Det som måste hålla:
 *   hemligheterna skiljs ut ur exporten och kommer tillbaka i filen
 *   skärmens val går före kundens, som går före standarden
 *   det som kan stänga ute oss varnas för, och bara när det ändras
 *   filen bär sin version, så att skärmen kan bevisa vad den läst in
 *
 * Alla koder här är påhittade. Repot är publikt.
 */

const FAKE_PIN = "0000-test";

const EXPORT = JSON.stringify({
  startURL: "https://portal.tikkr.se/kiosk",
  kioskMode: true,
  websiteIntegration: true,
  mdmLockTask: true,
  timeToScreensaverV2: "900",
  actionBarFgColor: -1,
  kioskPin: FAKE_PIN,
  remoteAdminPassword: "test-losen",
  volumeLicenseKey: "test-nyckel",
  volumeLicenseStatus: "No licensed",
  customVariable: "något gammalt",
});

function parts(text = EXPORT): ConfigParts {
  const result = parseConfigUpload(text);
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("en uppladdad export", () => {
  it("skiljer ut hemligheterna", () => {
    const { settings, secrets } = parts();

    expect(secrets).toEqual({
      kioskPin: FAKE_PIN,
      remoteAdminPassword: "test-losen",
      volumeLicenseKey: "test-nyckel",
    });
    expect(settings).not.toHaveProperty("kioskPin");
    expect(settings.startURL).toBe("https://portal.tikkr.se/kiosk");
  });

  it("behåller tal och av/på som de är", () => {
    const { settings } = parts();
    expect(settings.actionBarFgColor).toBe(-1);
    expect(settings.kioskMode).toBe(true);
  });

  it("tar bort appens licensbesked och vårt eget versionsfält", () => {
    const { settings } = parts();
    expect(settings).not.toHaveProperty("volumeLicenseStatus");
    expect(settings).not.toHaveProperty("customVariable");
  });

  it("de krypterade varianterna i en export är också hemligheter", () => {
    expect(isSecretKey("kioskPinEnc")).toBe(true);
    expect(isSecretKey("remoteAdminPasswordEnc")).toBe(true);
    expect(isSecretKey("startURL")).toBe(false);
  });

  it("säger vad som är fel med en trasig fil", () => {
    expect(parseConfigUpload("inte json")).toHaveProperty("error");
    expect(parseConfigUpload("[1,2]")).toHaveProperty("error");
    expect(parseConfigUpload("{}")).toHaveProperty("error");
    expect(parseConfigUpload(JSON.stringify({ a: { b: 1 } }))).toHaveProperty("error");
  });
});

describe("filen skärmen läser in", () => {
  it("har hemligheterna tillbaka och märket med versionen", () => {
    const file = buildConfigFile(parts(), "cmh1abcdef0123456789");

    expect(file.kioskPin).toBe(FAKE_PIN);
    expect(file.startURL).toBe("https://portal.tikkr.se/kiosk");
    expect(file.customVariable).toBe(`${CONFIG_MARKER}cmh1abcdef0123456789`);
  });

  it("blir likadan varje gång", () => {
    expect(JSON.stringify(buildConfigFile(parts(), "cmh1abcdef0123456789"))).toBe(
      JSON.stringify(buildConfigFile(parts(), "cmh1abcdef0123456789"))
    );
  });

  it("märket läses tillbaka till versionen", () => {
    expect(versionFromMarker(markerFor("cmh1abcdef0123456789"))).toBe("cmh1abcdef0123456789");
    expect(versionFromMarker("något annat")).toBeNull();
    expect(versionFromMarker(`${CONFIG_MARKER}<script>`)).toBeNull();
    expect(versionFromMarker(null)).toBeNull();
  });
});

describe("vilken konfiguration som gäller", () => {
  it("skärmens går före kundens, som går före standarden", () => {
    expect(resolveConfigId("skarm", "kund", "standard")).toBe("skarm");
    expect(resolveConfigId(null, "kund", "standard")).toBe("kund");
    expect(resolveConfigId(null, null, "standard")).toBe("standard");
    expect(resolveConfigId(null, null, null)).toBeNull();
  });
});

describe("varningarna", () => {
  const HOSTS = ["portal.tikkr.se", "www.tikkr.se"];

  function changed(
    overrides: Record<string, string | boolean>,
    secrets: Record<string, string> = {}
  ): ConfigParts {
    const base = parts();
    return {
      settings: { ...base.settings, ...overrides },
      secrets: { ...base.secrets, ...secrets },
    };
  }

  it("ingen varning när inget farligt ändras", () => {
    expect(configWarnings(parts(), changed({ timeToScreensaverV2: "60" }), HOSTS)).toEqual([]);
  });

  it("en startadress utanför Tikkr", () => {
    const warnings = configWarnings(parts(), changed({ startURL: "https://annan.example/x" }), HOSTS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("annan.example");
  });

  it("en startadress på Tikkrs andra värd är ingen varning", () => {
    expect(
      configWarnings(parts(), changed({ startURL: "https://www.tikkr.se/kiosk" }), HOSTS)
    ).toEqual([]);
  });

  it("gränssnittet, kioskläget och Lock Task som stängs av", () => {
    const warnings = configWarnings(
      parts(),
      changed({ websiteIntegration: false, kioskMode: "false", mdmLockTask: false }),
      HOSTS
    );
    expect(warnings).toHaveLength(3);
  });

  it("varnar inte igen för något som redan var av", () => {
    const before = changed({ kioskMode: false });
    expect(configWarnings(before, changed({ kioskMode: false }), HOSTS)).toEqual([]);
  });

  it("en ny PIN-kod eller ett nytt lösenord", () => {
    const warnings = configWarnings(
      parts(),
      changed({}, { kioskPin: "1111-test", remoteAdminPassword: "nytt-test" }),
      HOSTS
    );
    expect(warnings).toHaveLength(2);
    // Varningen visar aldrig själva koden.
    expect(warnings.join(" ")).not.toContain("1111-test");
  });

  it("en första version jämförs inte mot någon PIN-kod", () => {
    expect(configWarnings(null, parts(), HOSTS)).toEqual([]);
  });
});
