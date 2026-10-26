import { describe, it, expect } from "vitest";
import { parseDeviceReport } from "@/lib/kiosk-report";

/**
 * Vad en stämplingsskärm får skriva om sig själv.
 *
 * Anropet är skärmens eget, så vem som helst med en kopplad skärm kan skicka
 * vad som helst. Det som skrivs ska vara strängar av rimlig längd och ett nät
 * ur en fast lista — och ett fält som saknas ska inte nolla det som står.
 *
 * Behöver ingen databas.
 */

describe("parseDeviceReport", () => {
  it("tar en fullständig rapport från en skärm på wifi", () => {
    expect(
      parseDeviceReport({
        fullyVersion: "1.61.4",
        webviewVersion: "142.0.7444.48",
        serialNumber: "PDX24X0042",
        network: { type: "WIFI", ssid: "Verkstaden", signal: "3" },
      })
    ).toEqual({
      fullyVersion: "1.61.4",
      webviewVersion: "142.0.7444.48",
      serialNumber: "PDX24X0042",
      networkType: "WIFI",
      wifiSsid: "Verkstaden",
      wifiSignal: "3",
    });
  });

  it("rör inte det en äldre skärm inte skickar", () => {
    // En kiosk från före nätstatusen skickar bara versionerna. Serienummer och
    // nät som en nyare version skrivit ska stå kvar.
    expect(
      parseDeviceReport({ fullyVersion: "1.61.4", webviewVersion: "142.0" })
    ).toEqual({ fullyVersion: "1.61.4", webviewVersion: "142.0" });
  });

  it("nollar wifiuppgifterna när skärmen bytt till kabel", () => {
    expect(
      parseDeviceReport({
        network: { type: "WIRED", ssid: "Förra nätet", signal: "4" },
      })
    ).toEqual({ networkType: "WIRED", wifiSsid: null, wifiSignal: null });
  });

  it("nollar nätet när skärmen uttryckligen inte vet", () => {
    expect(parseDeviceReport({ network: null })).toEqual({
      networkType: null,
      wifiSsid: null,
      wifiSignal: null,
    });
  });

  it("ignorerar en nättyp som inte finns i listan", () => {
    expect(
      parseDeviceReport({ network: { type: "SATELLIT", ssid: "x" } })
    ).toEqual({});
  });

  it("kapar en orimligt lång sträng", () => {
    const result = parseDeviceReport({ serialNumber: "x".repeat(5000) });
    expect(result.serialNumber?.length).toBe(120);
  });

  it("gör en tom sträng eller ett icke-strängvärde till null", () => {
    expect(
      parseDeviceReport({
        fullyVersion: "   ",
        webviewVersion: 142,
        serialNumber: { inte: "en sträng" },
      })
    ).toEqual({ fullyVersion: null, webviewVersion: null, serialNumber: null });
  });

  it("tar inte emot fält som inte hör till rapporten", () => {
    // Allt utanför listan faller bort. Ett id, en ljusstyrka eller en
    // omstartstid går inte att sätta från skärmen.
    expect(
      parseDeviceReport({
        id: "annan-skarm",
        companyId: "annat-foretag",
        brightness: 0,
        restartRequestedAt: "2026-10-19T00:00:00Z",
        reportedAt: "1970-01-01T00:00:00Z",
      })
    ).toEqual({});
  });

  it("tar emot konfigurationens version, men bara ett id", () => {
    expect(parseDeviceReport({ configVersionId: "cmh1abcdef0123456789" })).toEqual({
      configVersionId: "cmh1abcdef0123456789",
    });
    expect(parseDeviceReport({ configVersionId: "'; drop table" })).toEqual({});
    expect(parseDeviceReport({ configVersionId: 42 })).toEqual({});
  });

  it("klarar ett anrop som inte är ett objekt", () => {
    expect(parseDeviceReport(null)).toEqual({});
    expect(parseDeviceReport("text")).toEqual({});
    expect(parseDeviceReport(42)).toEqual({});
  });
});
