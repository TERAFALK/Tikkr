import { describe, it, expect, afterEach, vi } from "vitest";
import {
  applyBrightness,
  hasFully,
  readDeviceInfo,
  restartApp,
} from "@/lib/fully";

/**
 * Bryggan till kioskappen.
 *
 * Den viktigaste regeln: EN KUNDS EGEN DATOR SKA ALDRIG MÄRKA ATT FILEN FINNS.
 * Kunden får använda vilken pekskärm som helst, och där finns inget
 * `fully`-objekt. Går något sönder utan appen har vi två produkter att
 * underhålla, och den billigare går sönder först.
 *
 * Behöver ingen databas.
 */

/** Sätter upp ett låtsas-`fully` på window, som appen skulle ha gjort. */
function withBridge(bridge: Record<string, unknown>) {
  (globalThis as { window?: unknown }).window = { fully: bridge };
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
    withBridge({});
    expect(hasFully()).toBe(true);
  });

  it("läser av app- och webbmotorversion", () => {
    withBridge({
      getDeviceInfo: () =>
        JSON.stringify({ appVersionName: "1.57.1", webviewVersion: "124.0" }),
    });

    expect(readDeviceInfo()).toEqual({
      fullyVersion: "1.57.1",
      webviewVersion: "124.0",
    });
  });

  it("tål att fält saknas", () => {
    withBridge({ getDeviceInfo: () => JSON.stringify({ annat: "värde" }) });

    expect(readDeviceInfo()).toEqual({
      fullyVersion: null,
      webviewVersion: null,
    });
  });

  it("tål trasig JSON utan att kasta", () => {
    withBridge({ getDeviceInfo: () => "{inte json" });
    expect(readDeviceInfo()).toBeNull();
  });

  it("räknar om procent till appens skala", () => {
    const set = vi.fn();
    withBridge({ setBrightness: set });

    applyBrightness(100);
    expect(set).toHaveBeenLastCalledWith(255);

    applyBrightness(0);
    expect(set).toHaveBeenLastCalledWith(0);

    applyBrightness(50);
    expect(set).toHaveBeenLastCalledWith(128);
  });

  it("håller sig innanför 0 och 100 även vid orimliga värden", () => {
    const set = vi.fn();
    withBridge({ setBrightness: set });

    applyBrightness(999);
    expect(set).toHaveBeenLastCalledWith(255);

    applyBrightness(-40);
    expect(set).toHaveBeenLastCalledWith(0);
  });

  it("godtar den andra stavningen av ljusstyrkefunktionen", () => {
    const set = vi.fn();
    withBridge({ setScreenBrightness: set });

    applyBrightness(100);
    expect(set).toHaveBeenCalledWith(255);
  });

  it("startar om", () => {
    const restart = vi.fn();
    withBridge({ restartApp: restart });

    restartApp();
    expect(restart).toHaveBeenCalledOnce();
  });

  it("en funktion som kastar fäller inte skärmen", () => {
    withBridge({
      setBrightness: () => {
        throw new Error("WRITE_SETTINGS saknas");
      },
      restartApp: () => {
        throw new Error("nej");
      },
      getDeviceInfo: () => {
        throw new Error("nej");
      },
    });

    expect(() => applyBrightness(50)).not.toThrow();
    expect(() => restartApp()).not.toThrow();
    expect(readDeviceInfo()).toBeNull();
  });

  it("en app utan funktionerna gör tyst ingenting", () => {
    withBridge({});

    expect(() => applyBrightness(50)).not.toThrow();
    expect(() => restartApp()).not.toThrow();
    expect(readDeviceInfo()).toBeNull();
  });
});
