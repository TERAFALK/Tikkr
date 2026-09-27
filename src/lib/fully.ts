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
  getDeviceInfo?: () => string;
  /** Två stavningar finns i omlopp mellan versioner. Se applyBrightness. */
  setBrightness?: (value: number) => void;
  setScreenBrightness?: (value: number) => void;
  restartApp?: () => void;
  restart?: () => void;
}

/**
 * Appens skala för ljusstyrka.
 *
 * ⟨verifiera⟩ på första fysiska enheten. Android räknar själv 0–255, och
 * appen speglar normalt det — men intervallet är inte dokumenterat på ett
 * sätt jag kunnat belägga. Blir det fel är det den här raden som ändras, och
 * ingenting annat.
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

export interface FullyDeviceInfo {
  fullyVersion: string | null;
  webviewVersion: string | null;
}

/**
 * Läser av enheten.
 *
 * `getDeviceInfo` svarar med JSON som text, och fältnamnen skiljer sig mellan
 * versioner. Därför plockas bara det vi behöver, och allt annat ignoreras —
 * en ny appversion ska inte kunna fälla stämplingsskärmen.
 */
export function readDeviceInfo(): FullyDeviceInfo | null {
  const api = bridge();
  if (!api?.getDeviceInfo) return null;

  try {
    const raw = api.getDeviceInfo();
    const info = JSON.parse(raw) as Record<string, unknown>;

    const text = (value: unknown): string | null =>
      typeof value === "string" && value.trim() !== "" ? value.trim() : null;

    return {
      fullyVersion: text(info.appVersionName) ?? text(info.appVersionCode),
      webviewVersion: text(info.webviewVersion) ?? text(info.webviewUA),
    };
  } catch {
    // Trasig JSON eller en funktion som betett sig oväntat. Skärmen ska
    // stämpla vidare — enhetsuppgifter är trevliga att ha, inte nödvändiga.
    return null;
  }
}

/** Ställer ljusstyrkan. `percent` är 0–100. Gör ingenting utan appen. */
export function applyBrightness(percent: number): void {
  const api = bridge();
  if (!api) return;

  // Två stavningar har funnits i appens gränssnitt. Att ta den som finns är
  // billigare än att låsa sig vid en och tyst sluta fungera vid en uppdatering.
  const set = api.setBrightness ?? api.setScreenBrightness;
  if (typeof set !== "function") return;

  const clamped = Math.min(100, Math.max(0, Math.round(percent)));

  try {
    set(Math.round((clamped / 100) * BRIGHTNESS_MAX));
  } catch {
    // Saknad behörighet, troligen WRITE_SETTINGS. Inget att göra åt härifrån,
    // och absolut inget att fälla skärmen för.
  }
}

/** Startar om kioskappen. Gör ingenting utan appen. */
export function restartApp(): void {
  const api = bridge();
  if (!api) return;

  const restart = api.restartApp ?? api.restart;
  if (typeof restart !== "function") return;

  try {
    restart();
  } catch {
    // Se applyBrightness.
  }
}
