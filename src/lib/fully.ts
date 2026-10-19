/**
 * BRYGGAN TILL KIOSKAPPEN.
 *
 * Skärmarna vi säljer i stativ kör webbsidan inuti Fully Kiosk Browser —
 * samma app som ProDVX säljer under namnet ProMGR. Är den inställningen
 * påslagen lägger appen ett `fully`-objekt i sidans JavaScript, och sidan kan
 * då nå ner i Android: läsa av enheten, ändra ljusstyrkan, starta om sig.
 *
 * DEN HÄR FILEN ÄR EN VÄGG, och det är hela poängen med den.
 *
 * En kund får lika gärna använda sin egen dator med mus eller en vanlig
 * surfplatta. Där finns inget `fully`-objekt. Skulle resten av kiosken känna
 * till appen hade vi i praktiken haft två produkter att underhålla, och den
 * billigare av dem hade gått sönder först. Därför frågar allt annat den här
 * filen, och den svarar null när appen inte finns. Ingen annan fil nämner
 * Fully vid namn.
 *
 * Fjärrstyrningen ligger i adminpanelen, aldrig på stämplingsskärmen.
 * Kiosken har ingen inloggning — ett reglage där hade låtit vem som helst
 * släcka stämpelklockan, och då går arbetstid förlorad. Se CLAUDE.md § 7.1:
 * gränssnitt som inte behöver finnas ska inte finnas.
 *
 * FUNKTIONSNAMNEN är de i Fullys egen dokumentation av JavaScript-gränssnittet
 * (fully-kiosk.com, avsnittet JavaScript Interface). Första versionen av filen
 * byggde på `getDeviceInfo()`, som bara finns i Fullys fjärr-API och inte för
 * webbsidan, och på den första fysiska skärmen rapporterade den därför
 * ingenting. Ett nytt namn här kontrolleras mot dokumentationen, inte mot en
 * sammanfattning av den.
 *
 * FUNKTIONERNA ANROPAS SOM METODER PÅ OBJEKTET, alltid `api.restartApp()` och
 * aldrig en loss-plockad `restart()`. Androids WebView avvisar ett anrop där
 * `this` inte är det inlagda objektet, och felet syns inte — det fångas av
 * `try` nedan och skärmen gör tyst ingenting. `tests/fully.test.ts` har en
 * brygga som kastar på samma sätt.
 *
 * SÄKERHET. Appen lägger `fully` hos den sida som är laddad, vilken den än
 * är. Inställningen får därför bara vara påslagen i kombination med en låst
 * startadress. Det är en uppsättningsregel och står i docs/kioskskarm.md —
 * den går inte att vakta härifrån.
 *
 * Körs bara i webbläsaren.
 */

/**
 * Det vi faktiskt använder av appens gränssnitt. Allt är valfritt: versioner
 * kommer och går, och en funktion som saknas ska ge tyst ingenting i stället
 * för ett fel mitt i en stämpling.
 */
interface FullyBridge {
  getFullyVersion?: () => string;
  getWebviewVersion?: () => string;
  /** Kräver att Fully är device owner. Se readSerialNumber. */
  getSerialNumberDeviceOwner?: () => string;
  getSerialNumber?: () => string;
  isNetworkConnected?: () => boolean;
  isWifiConnected?: () => boolean;
  getWifiSsid?: () => string;
  /** En sträng, utan dokumenterad skala. */
  getWifiSignalLevel?: () => string;
  /** `-1` betyder enhetens standard. */
  setScreenBrightness?: (level: number) => void;
  restartApp?: () => void;
}

/**
 * Appens skala för ljusstyrka.
 *
 * ⟨verifiera⟩ på första fysiska enheten. Dokumentationen säger bara att
 * `setScreenBrightness` tar ett heltal, och Android räknar själv 0–255. Blir
 * det fel är det den här raden som ändras, och ingenting annat.
 */
const BRIGHTNESS_MAX = 255;

function bridge(): FullyBridge | null {
  if (typeof window === "undefined") return null;

  const candidate = (window as unknown as { fully?: FullyBridge }).fully;
  return candidate && typeof candidate === "object" ? candidate : null;
}

/** true på en skärm vi sålt, false på en kunds egen dator. */
export function hasFully(): boolean {
  return bridge() !== null;
}

export interface FullyNetwork {
  type: "WIFI" | "WIRED";
  ssid: string | null;
  signal: string | null;
}

export interface FullyDeviceInfo {
  fullyVersion: string;
  webviewVersion: string | null;
  serialNumber: string | null;
  network: FullyNetwork | null;
}

/** Ett ifyllt strängvärde, eller null för allt annat. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Kör ett anrop till appen och ger null om det kastar.
 *
 * Funktionen som skickas in ska anropa som metod, `() => api.getX?.()`, aldrig
 * en loss-plockad funktion. Se rubriken överst i filen.
 *
 * Varje uppgift läses för sig: en webbmotor som inte svarar ska inte kosta
 * appens version, och en ny appversion ska aldrig kunna fälla
 * stämplingsskärmen.
 */
function safely<T>(read: () => T): T | null {
  try {
    return read() ?? null;
  } catch {
    return null;
  }
}

/**
 * Det Android lämnar i stället för ett serienummer när appen inte får se det.
 * Ett sådant värde är inget nummer och ska inte stå i panelen som ett.
 */
const NOT_A_SERIAL = /^(unknown|<unknown>|null|0+)$/i;

/**
 * Serienumret.
 *
 * Modern Android ger inte en vanlig app tillgång till det, vilket Fully skriver
 * i sin dokumentation. Som device owner får appen det, och då svarar
 * `getSerialNumberDeviceOwner`. Annars prövas den vanliga, som på äldre
 * Android kan svara.
 */
function readSerialNumber(api: FullyBridge): string | null {
  for (const value of [
    safely(() => api.getSerialNumberDeviceOwner?.()),
    safely(() => api.getSerialNumber?.()),
  ]) {
    const serial = text(value);
    if (serial && !NOT_A_SERIAL.test(serial)) return serial;
  }
  return null;
}

/**
 * Nätet enheten sitter på.
 *
 * Wifi om wifi är anslutet, annars kabel om något nät alls är det. ProDVX-
 * skärmarna har ingen SIM-plats, så "anslutet men inte wifi" är i praktiken
 * nätverkskabel.
 */
function readNetwork(api: FullyBridge): FullyNetwork | null {
  if (safely(() => api.isWifiConnected?.()) === true) {
    // Android lämnar namnet inom citattecken, och ett namn den inte får visa
    // som "<unknown ssid>".
    const raw = text(safely(() => api.getWifiSsid?.()));
    const ssid =
      raw && raw !== "<unknown ssid>" ? raw.replace(/^"(.*)"$/, "$1") : null;

    return {
      type: "WIFI",
      ssid,
      signal: text(safely(() => api.getWifiSignalLevel?.())),
    };
  }

  if (safely(() => api.isNetworkConnected?.()) === true) {
    return { type: "WIRED", ssid: null, signal: null };
  }

  return null;
}

/**
 * Läser av enheten.
 *
 * Null när appens version inte går att läsa. Det är versionen som gör skärmen
 * till en Tikkr-skärm i adminpanelen, så utan den finns inget att rapportera.
 */
export function readDeviceInfo(): FullyDeviceInfo | null {
  const api = bridge();
  if (!api) return null;

  const fullyVersion = text(safely(() => api.getFullyVersion?.()));
  if (!fullyVersion) return null;

  return {
    fullyVersion,
    webviewVersion: text(safely(() => api.getWebviewVersion?.())),
    serialNumber: readSerialNumber(api),
    network: readNetwork(api),
  };
}

/** Ställer ljusstyrkan. `percent` är 0–100. Gör ingenting utan appen. */
export function applyBrightness(percent: number): void {
  const api = bridge();
  if (typeof api?.setScreenBrightness !== "function") return;

  const clamped = Math.min(100, Math.max(0, Math.round(percent)));

  try {
    api.setScreenBrightness(Math.round((clamped / 100) * BRIGHTNESS_MAX));
  } catch {
    // Saknad behörighet, troligen WRITE_SETTINGS. Inget att göra åt härifrån,
    // och absolut inget att fälla skärmen för.
  }
}

/** Startar om kioskappen. Gör ingenting utan appen. */
export function restartApp(): void {
  const api = bridge();
  if (typeof api?.restartApp !== "function") return;

  try {
    api.restartApp();
  } catch {
    // Se applyBrightness.
  }
}
