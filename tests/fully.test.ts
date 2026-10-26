import { describe, it, expect, afterEach } from "vitest";
import {
  applyBrightness,
  applyKioskSettings,
  hasFully,
  readDeviceInfo,
  restartApp,
  restartDevice,
} from "@/lib/fully";

/**
 * Bryggan till kioskappen.
 *
 * Den viktigaste regeln: EN KUNDS EGEN DATOR SKA ALDRIG MÄRKA ATT FILEN FINNS.
 * Kunden får använda vilken pekskärm som helst, och där finns inget
 * `fully`-objekt. Går något sönder utan appen har vi två produkter att
 * underhålla, och den billigare går sönder först.
 *
 * Funktionsnamnen kommer ur Fullys egen dokumentation av JavaScript-
 * gränssnittet. Första versionen av bryggan byggde på `getDeviceInfo()`, som
 * bara finns i Fullys fjärr-API och inte för webbsidan, och på den första
 * fysiska skärmen rapporterade den därför ingenting.
 *
 * Behöver ingen databas.
 */

/**
 * Ett `fully`-objekt som beter sig som Androids brygga.
 *
 * WebView vägrar ett anrop där funktionen lyfts loss från objektet: den måste
 * anropas som en metod på det. Ett vanligt testobjekt bryr sig inte om det, och
 * första versionen av bryggan gick därför igenom testerna men tyst sönder på
 * riktig hårdvara. Här kastar varje funktion om `this` inte är objektet.
 */
function javaBridge(methods: Record<string, (...args: never[]) => unknown>) {
  const calls: { name: string; args: unknown[] }[] = [];
  const bridge: Record<string, unknown> = {};

  for (const [name, impl] of Object.entries(methods)) {
    bridge[name] = function (this: unknown, ...args: never[]) {
      if (this !== bridge) {
        throw new Error(
          "Java bridge method can't be invoked on a non-injected object"
        );
      }
      calls.push({ name, args });
      return impl(...args);
    };
  }

  (globalThis as { window?: unknown }).window = {
    fully: bridge,
    location: { origin: "https://portal.tikkr.se" },
  };
  return calls;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("utan kioskappen", () => {
  it("hasFully är false", () => {
    expect(hasFully()).toBe(false);
  });

  it("hasFully är false även när window finns men inget fully", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(hasFully()).toBe(false);
  });

  it("readDeviceInfo ger null i stället för att kasta", () => {
    expect(readDeviceInfo()).toBeNull();
  });

  it("applyBrightness och restartApp gör tyst ingenting", () => {
    expect(() => applyBrightness(50)).not.toThrow();
    expect(() => restartApp()).not.toThrow();
  });
});

describe("med kioskappen", () => {
  it("känner igen skärmen", () => {
    javaBridge({});
    expect(hasFully()).toBe(true);
  });

  it("läser app- och webbmotorversion med Fullys dokumenterade funktioner", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      getWebviewVersion: () => "124.0.6367.82",
    });

    expect(readDeviceInfo()).toMatchObject({
      fullyVersion: "1.61.4",
      webviewVersion: "124.0.6367.82",
    });
  });

  it("rapporterar ingenting utan appens version", () => {
    // Det är versionen som gör skärmen till en Tikkr-skärm i panelen. Utan den
    // finns inget att visa, och inget att skicka.
    javaBridge({ getWebviewVersion: () => "124.0" });
    expect(readDeviceInfo()).toBeNull();
  });

  it("klarar sig utan webbmotorns version", () => {
    javaBridge({ getFullyVersion: () => "1.61.4" });

    expect(readDeviceInfo()).toEqual({
      fullyVersion: "1.61.4",
      webviewVersion: null,
      serialNumber: null,
      network: null,
    });
  });

  it("läser wifinätet utan Androids citattecken", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      isWifiConnected: () => true,
      isNetworkConnected: () => true,
      getWifiSsid: () => '"Verkstaden"',
      getWifiSignalLevel: () => "3",
    });

    expect(readDeviceInfo()?.network).toEqual({
      type: "WIFI",
      ssid: "Verkstaden",
      signal: "3",
    });
  });

  it("lämnar inget nätverksnamn när Android döljer det", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      isWifiConnected: () => true,
      getWifiSsid: () => "<unknown ssid>",
    });

    expect(readDeviceInfo()?.network).toEqual({
      type: "WIFI",
      ssid: null,
      signal: null,
    });
  });

  it("anslutet nät som inte är wifi är kabel", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      isWifiConnected: () => false,
      isNetworkConnected: () => true,
      getWifiSsid: () => '"Förra nätet"',
    });

    expect(readDeviceInfo()?.network).toEqual({
      type: "WIRED",
      ssid: null,
      signal: null,
    });
  });

  it("rapporterar inget nät när enheten säger att inget är anslutet", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      isWifiConnected: () => false,
      isNetworkConnected: () => false,
    });

    expect(readDeviceInfo()?.network).toBeNull();
  });

  it("tar serienumret som device owner i första hand", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      getSerialNumberDeviceOwner: () => "PDX24X0042",
      getSerialNumber: () => "unknown",
    });

    expect(readDeviceInfo()?.serialNumber).toBe("PDX24X0042");
  });

  it("faller tillbaka på det vanliga serienumret", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      getSerialNumberDeviceOwner: () => "",
      getSerialNumber: () => "PDX24X0042",
    });

    expect(readDeviceInfo()?.serialNumber).toBe("PDX24X0042");
  });

  it("visar inte Androids platshållare som ett serienummer", () => {
    // Utan device owner svarar modern Android med en platshållare.
    for (const placeholder of ["unknown", "UNKNOWN", "<unknown>", "0", "000"]) {
      javaBridge({
        getFullyVersion: () => "1.61.4",
        getSerialNumberDeviceOwner: () => placeholder,
        getSerialNumber: () => placeholder,
      });

      expect(readDeviceInfo()?.serialNumber).toBeNull();
    }
  });

  it("ett nätanrop som kastar kostar inte resten av rapporten", () => {
    javaBridge({
      getFullyVersion: () => "1.61.4",
      getWebviewVersion: () => "142.0",
      isWifiConnected: () => {
        throw new Error("nej");
      },
      isNetworkConnected: () => {
        throw new Error("nej");
      },
    });

    expect(readDeviceInfo()).toEqual({
      fullyVersion: "1.61.4",
      webviewVersion: "142.0",
      serialNumber: null,
      network: null,
    });
  });

  it("behandlar en tom sträng som saknad", () => {
    javaBridge({ getFullyVersion: () => "  ", getWebviewVersion: () => "" });
    expect(readDeviceInfo()).toBeNull();
  });

  it("räknar om procent till appens skala", () => {
    const calls = javaBridge({ setScreenBrightness: () => undefined });

    applyBrightness(100);
    applyBrightness(0);
    applyBrightness(50);

    expect(calls.map((c) => c.args[0])).toEqual([255, 0, 128]);
  });

  it("håller sig innanför 0 och 100 även vid orimliga värden", () => {
    const calls = javaBridge({ setScreenBrightness: () => undefined });

    applyBrightness(999);
    applyBrightness(-40);

    expect(calls.map((c) => c.args[0])).toEqual([255, 0]);
  });

  it("startar om", () => {
    const calls = javaBridge({ restartApp: () => undefined });

    restartApp();
    expect(calls.map((c) => c.name)).toEqual(["restartApp"]);
  });

  it("en funktion som kastar fäller inte skärmen", () => {
    javaBridge({
      setScreenBrightness: () => {
        throw new Error("WRITE_SETTINGS saknas");
      },
      restartApp: () => {
        throw new Error("nej");
      },
      getFullyVersion: () => {
        throw new Error("nej");
      },
    });

    expect(() => applyBrightness(50)).not.toThrow();
    expect(() => restartApp()).not.toThrow();
    expect(readDeviceInfo()).toBeNull();
  });

  it("en app utan funktionerna gör tyst ingenting", () => {
    javaBridge({});

    expect(() => applyBrightness(50)).not.toThrow();
    expect(() => restartApp()).not.toThrow();
    expect(readDeviceInfo()).toBeNull();
  });
});

describe("omstart av hela skärmen", () => {
  it("startar om enheten när appen kan", () => {
    const calls = javaBridge({ reboot: () => undefined, restartApp: () => undefined });

    restartDevice();
    expect(calls.map((c) => c.name)).toEqual(["reboot"]);
  });

  it("startar om appen när enheten inte går", () => {
    const calls = javaBridge({
      reboot: () => {
        throw new Error("inte device owner");
      },
      restartApp: () => undefined,
    });

    restartDevice();
    expect(calls.map((c) => c.name)).toEqual(["reboot", "restartApp"]);
  });

  it("startar om appen när funktionen saknas", () => {
    const calls = javaBridge({ restartApp: () => undefined });

    restartDevice();
    expect(calls.map((c) => c.name)).toEqual(["restartApp"]);
  });

  it("gör tyst ingenting utan appen", () => {
    expect(() => restartDevice()).not.toThrow();
  });
});

describe("inställningarna från panelen", () => {
  const SETTINGS = {
    screensaverMinutes: "15",
    screensaverBrightness: "15",
    dailyRestart: "03:00",
  };

  function settingCalls(calls: { name: string; args: unknown[] }[]) {
    return Object.fromEntries(
      calls
        .filter((c) => c.name === "setStringSetting" || c.name === "setBooleanSetting")
        .map((c) => [c.args[0], c.args[1]])
    );
  }

  it("översätts till appens nycklar och skalor", () => {
    const calls = javaBridge({
      setStringSetting: () => undefined,
      setBooleanSetting: () => undefined,
    });

    applyKioskSettings(SETTINGS);

    expect(settingCalls(calls)).toEqual({
      // Appen räknar sekunder och 0–255.
      timeToScreensaverV2: "900",
      screensaverBrightness: "38",
      screensaverWallpaperURL:
        "https://portal.tikkr.se/brand/tikkr-skarmslackare-1920x1080.png",
      mdmRebootTime: "03:00",
      reloadOnWifiOn: true,
    });
  });

  it("en avstängd omstart skickas som tom text", () => {
    const calls = javaBridge({
      setStringSetting: () => undefined,
      setBooleanSetting: () => undefined,
    });

    applyKioskSettings({ ...SETTINGS, dailyRestart: "" });
    expect(settingCalls(calls).mdmRebootTime).toBe("");
  });

  it("skickar aldrig något annat än det som står i bryggan", () => {
    const calls = javaBridge({
      setStringSetting: () => undefined,
      setBooleanSetting: () => undefined,
    });

    // En server som skickar mer än registret får ändå inte nå appen.
    applyKioskSettings({
      ...SETTINGS,
      kioskPin: "0000",
      startURL: "https://annan.example",
    } as typeof SETTINGS);

    const keys = Object.keys(settingCalls(calls));
    expect(keys).not.toContain("kioskPin");
    expect(keys).not.toContain("startURL");
    expect(keys.sort()).toEqual(
      [
        "mdmRebootTime",
        "reloadOnWifiOn",
        "screensaverBrightness",
        "screensaverWallpaperURL",
        "timeToScreensaverV2",
      ].sort()
    );
  });

  it("en inställning som kastar kostar inte de andra", () => {
    const set: string[] = [];
    javaBridge({
      setStringSetting: ((key: string) => {
        if (key === "mdmRebootTime") throw new Error("nej");
        set.push(key);
      }) as never,
      setBooleanSetting: () => undefined,
    });

    expect(() => applyKioskSettings(SETTINGS)).not.toThrow();
    expect(set).toContain("timeToScreensaverV2");
    expect(set).toContain("screensaverWallpaperURL");
  });

  it("gör tyst ingenting utan appen", () => {
    expect(() => applyKioskSettings(SETTINGS)).not.toThrow();
  });
});
