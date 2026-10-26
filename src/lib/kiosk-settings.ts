/**
 * INSTÄLLNINGARNA PÅ SKÄRMARNA VI SÄLJER.
 *
 * Skärmen ställs in en gång vid provisioneringen, ur en konfiguration i
 * ProDVX portal. Att ändra något efteråt krävde antingen en molnprenumeration
 * eller ett besök med en USB-sticka. Kioskappen låter webbsidan sätta sina
 * egna inställningar, och Tikkr skickar därför ut de här på samma sätt som
 * ljusstyrkan: med svaret skärmen ändå hämtar var femte sekund.
 *
 * TVÅ NIVÅER, och den mest specifika vinner. Plattformens standard gäller
 * alla sålda skärmar; ett värde på en kund gäller bara den kundens. Saknas
 * båda gäller värdet här i registret. Raden ÄR tillståndet, som för avtalade
 * priser: ingen rad betyder att nivån ovanför gäller, och ett tomt fält i
 * plattformspanelen tar bort raden. Att stänga av något är därför ett eget
 * värde, 0 eller "av", och aldrig ett tomt fält.
 *
 * Bara det som står här kan ändras på distans, och listan är avsiktligt kort.
 * PIN-koden, startadressen och kioskläget står INTE här och ska aldrig göra
 * det. En hemlighet hör inte hemma i vår databas, och ett fel i startadressen
 * eller kioskläget gör en skärm omöjlig att nå på distans igen.
 *
 * Filen har inga importer och ska inte få några. Plattformens formulär är
 * klientkomponenter och läser den, och vad kioskappen kallar inställningarna
 * vet bara fully.ts.
 */

export const KIOSK_SETTING_KEYS = [
  "screensaverMinutes",
  "screensaverBrightness",
  "dailyRestart",
] as const;

export type KioskSettingKey = (typeof KIOSK_SETTING_KEYS)[number];

/** Värdena som de lagras och skickas, alltid som text. */
export type KioskSettings = Record<KioskSettingKey, string>;

interface KioskSettingDefinition {
  label: string;
  /** Fälthjälp: formatet, inte varför fältet finns. */
  hint: string;
  /** Värdet när varken plattformen eller kunden satt något. */
  fallback: string;
  /** Läser ett inskrivet värde. Ger värdet som det lagras, eller ett fel. */
  parse: (raw: string) => { value: string } | { error: string };
  /** Värdet som det visas i en lista. */
  describe: (value: string) => string;
}

function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

export const KIOSK_SETTINGS: Record<KioskSettingKey, KioskSettingDefinition> = {
  // Femton minuter: under en arbetsdag trycker någon oftare än så, så skärmen
  // står tänd när den används och släcks kvällar, nätter och helger. Noll
  // stänger av den. Skärmsläckaren väcks av ett tryck som inte stämplar.
  screensaverMinutes: {
    label: "Skärmsläckare efter",
    hint: "Minuter utan tryck. 0 stänger av",
    fallback: "15",
    parse: (raw) => {
      const value = wholeNumber(raw, 0, 1440);
      return value === null
        ? { error: "Skriv ett antal minuter mellan 0 och 1440." }
        : { value: String(value) };
    },
    describe: (value) => (value === "0" ? "Av" : `${value} min`),
  },

  // Låg men läsbar. En svart bild sparar inte bakgrundsbelysningen; det är
  // ljusstyrkan som gör det.
  screensaverBrightness: {
    label: "Skärmsläckarens ljusstyrka",
    hint: "Procent, 0–100",
    fallback: "15",
    parse: (raw) => {
      const value = wholeNumber(raw, 0, 100);
      return value === null
        ? { error: "Skriv ett tal mellan 0 och 100." }
        : { value: String(value) };
    },
    describe: (value) => `${value} %`,
  },

  // Hela skärmen startar om, inte bara appen. Det är också när skärmen får en
  // ny version av Tikkr, eftersom sidan inte laddar om sig själv efter en
  // driftsättning. "av" stänger av och lagras som tom text, som appen läser
  // på samma sätt.
  dailyRestart: {
    label: "Daglig omstart",
    hint: "Klockslag, t.ex. 03:00, eller av",
    fallback: "03:00",
    parse: (raw) => {
      if (raw === "" || raw.toLowerCase() === "av") return { value: "" };
      const match = /^(\d{1,2})[:.](\d{2})$/.exec(raw);
      const hours = match ? Number(match[1]) : NaN;
      const minutes = match ? Number(match[2]) : NaN;
      if (!(hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59)) {
        return { error: "Skriv ett klockslag, till exempel 03:00." };
      }
      return {
        value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      };
    },
    describe: (value) => (value === "" ? "Av" : value),
  },
};

export function isKioskSettingKey(key: string): key is KioskSettingKey {
  return (KIOSK_SETTING_KEYS as readonly string[]).includes(key);
}

/**
 * Läser ett inskrivet värde. Mellanslag runt om tas bort.
 *
 * Används både när något sparas och när något läses ur databasen: ett värde
 * som en gång var giltigt men inte längre är det ska falla tillbaka, inte
 * skickas till skärmen.
 */
export function parseKioskSetting(
  key: KioskSettingKey,
  raw: string
): { value: string } | { error: string } {
  return KIOSK_SETTINGS[key].parse(raw.trim());
}

/**
 * Vad som gäller för en kund: kundens värde, annars plattformens, annars
 * registrets.
 *
 * Okända nycklar och ogiltiga värden hoppas över, så att en rad som blivit
 * kvar efter en ändring här aldrig når en skärm.
 */
export function resolveKioskSettings(
  defaults: Record<string, string>,
  overrides: Record<string, string>
): KioskSettings {
  const resolved = {} as KioskSettings;

  for (const key of KIOSK_SETTING_KEYS) {
    resolved[key] = KIOSK_SETTINGS[key].fallback;

    for (const source of [defaults, overrides]) {
      if (!(key in source)) continue;
      const parsed = parseKioskSetting(key, source[key]);
      if ("value" in parsed) resolved[key] = parsed.value;
    }
  }

  return resolved;
}
