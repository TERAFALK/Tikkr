"use client";

import { useEffect, useState } from "react";
import { hasFully, importSettingsFile, readSetting } from "@/lib/fully";

/**
 * PROV: LÄSER APPEN IN EN INSTÄLLNINGSFIL UTAN ATT TAPPA RESTEN?
 *
 * Tillfälligt. Tas bort i samma gren som konfigurationerna byggs.
 *
 * Provfilen innehåller en enda inställning, skärmsläckaren på 30 sekunder.
 * Frågan är vad som händer med allt som INTE står i filen: finns PIN-koden,
 * startadressen, kioskläget och JavaScript-gränssnittet kvar efteråt? Svaret
 * avgör om konfigurationer kan skickas som hela filer.
 *
 * Läsningen före sparas i webbläsaren, eftersom appen kan starta om sidan när
 * den läst in en fil.
 */

const KEYS: { key: string; kind: "string" | "boolean"; secret?: boolean }[] = [
  { key: "timeToScreensaverV2", kind: "string" },
  { key: "startURL", kind: "string" },
  { key: "kioskMode", kind: "boolean" },
  { key: "websiteIntegration", kind: "boolean" },
  { key: "mdmLockTask", kind: "boolean" },
  { key: "reloadOnWifiOn", kind: "boolean" },
  { key: "kioskPin", kind: "string", secret: true },
  { key: "volumeLicenseKey", kind: "string", secret: true },
];

const STORE = "tikkr-prov-import";

type Reading = Record<string, string>;

function read(): Reading {
  const reading: Reading = {};
  for (const { key, kind, secret } of KEYS) {
    const value = readSetting(key, kind);
    // Hemligheterna visas aldrig, bara om de finns.
    reading[key] =
      value === null ? "—" : secret ? (value ? `satt (${value.length} tecken)` : "TOM") : value;
  }
  return reading;
}

export default function ImportProbe() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [before, setBefore] = useState<Reading | null>(null);
  const [after, setAfter] = useState<Reading | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setAvailable(hasFully());
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) {
        setBefore(JSON.parse(saved));
        setAfter(read());
        return;
      }
    } catch {
      // Ingen lagring: provet fungerar ändå så länge sidan inte startas om.
    }
    setBefore(read());
  }, []);

  function run() {
    const current = read();
    setBefore(current);
    try {
      localStorage.setItem(STORE, JSON.stringify(current));
    } catch {}

    const ok = importSettingsFile(`${window.location.origin}/prov/fully-import.json`);
    setMessage(ok ? "Filen skickad till appen. Läser av om fem sekunder." : "Appen tog inte emot anropet.");
    if (ok) setTimeout(() => setAfter(read()), 5000);
  }

  function reset() {
    try {
      localStorage.removeItem(STORE);
    } catch {}
    setAfter(null);
    setBefore(read());
    setMessage(null);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 text-neutral-900">
      <h1 className="text-2xl font-semibold">Prov: inläsning av inställningsfil</h1>

      {available === false && (
        <p className="rounded-lg bg-amber-50 p-4">
          Sidan körs inte i kioskappen. Provet går bara att göra på skärmen.
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={run}
          className="rounded-xl bg-fjord px-6 py-4 text-lg font-semibold text-white"
        >
          Läs in provfilen
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-neutral-400 px-6 py-4 text-lg"
        >
          Börja om
        </button>
      </div>

      {message && <p>{message}</p>}

      <table className="w-full text-left text-base">
        <thead>
          <tr className="border-b border-neutral-300">
            <th className="py-2">Inställning</th>
            <th className="py-2">Före</th>
            <th className="py-2">Efter</th>
          </tr>
        </thead>
        <tbody>
          {KEYS.map(({ key }) => {
            const changed = before && after && before[key] !== after[key];
            return (
              <tr key={key} className="border-b border-neutral-100">
                <td className="py-2 font-mono text-sm">{key}</td>
                <td className="py-2">{before?.[key] ?? ""}</td>
                <td className={`py-2 ${changed ? "font-semibold text-amber-700" : ""}`}>
                  {after?.[key] ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
