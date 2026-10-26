import type { KioskNetworkType } from "@prisma/client";

/**
 * VAD EN STÄMPLINGSSKÄRM RAPPORTERAR OM SIG SJÄLV.
 *
 * Bara skärmar som kör i kioskappen hör av sig, via `POST /api/kiosk/device`.
 * Den här filen avgör vad av anropet som får skrivas på skärmens rad, och är
 * skild från rutten för att gå att testa utan databas.
 *
 * ANROPET ÄR SKÄRMENS EGET, och därmed något vem som helst med en kopplad
 * skärm kan skicka. Därför bara strängar av rimlig längd, och nätets typ ur en
 * fast lista. Inget här styr något — det visas i panelen och ingenting annat —
 * men en rad i panelen ska inte gå att fylla med en roman.
 *
 * ETT FÄLT SOM SAKNAS RÖRS INTE. En skärm med en äldre version av kiosken
 * skickar bara versionerna, och ska inte nolla ett serienummer som en nyare
 * version redan skrivit. Nätet är undantaget: skickas det skrivs alla tre
 * fälten, så att en skärm som bytt till kabel inte står kvar med förra
 * wifinätets namn.
 */

/** Versioner och serienummer är korta. Längre än så är något annat. */
const MAX_LENGTH = 120;

const NETWORK_TYPES: readonly KioskNetworkType[] = ["WIFI", "WIRED"];

export interface DeviceReportData {
  fullyVersion?: string | null;
  webviewVersion?: string | null;
  serialNumber?: string | null;
  networkType?: KioskNetworkType | null;
  wifiSsid?: string | null;
  wifiSignal?: string | null;
  /** Konfigurationsversionen skärmen läst in. Skrivs inte på raden här. */
  configVersionId?: string | null;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_LENGTH);
}

function isNetworkType(value: unknown): value is KioskNetworkType {
  return NETWORK_TYPES.includes(value as KioskNetworkType);
}

export function parseDeviceReport(body: unknown): DeviceReportData {
  if (!body || typeof body !== "object") return {};
  const report = body as Record<string, unknown>;

  const data: DeviceReportData = {};

  for (const key of ["fullyVersion", "webviewVersion", "serialNumber"] as const) {
    if (key in report) data[key] = clean(report[key]);
  }

  // Ett id, och ingenting annat. Om versionen finns prövar rutten.
  if (
    typeof report.configVersionId === "string" &&
    /^[a-z0-9]{10,40}$/i.test(report.configVersionId)
  ) {
    data.configVersionId = report.configVersionId;
  }

  if ("network" in report) {
    const network = report.network;

    if (network && typeof network === "object") {
      const { type, ssid, signal } = network as Record<string, unknown>;

      if (isNetworkType(type)) {
        data.networkType = type;
        // Ett nätverksnamn och en signal hör bara till wifi.
        data.wifiSsid = type === "WIFI" ? clean(ssid) : null;
        data.wifiSignal = type === "WIFI" ? clean(signal) : null;
      }
    } else if (network === null) {
      // Skärmen säger uttryckligen att den inte vet. Då står inget kvar.
      data.networkType = null;
      data.wifiSsid = null;
      data.wifiSignal = null;
    }
  }

  return data;
}
