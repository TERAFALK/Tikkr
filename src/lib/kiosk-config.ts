/**
 * KONFIGURATIONERNA FÖR SKÄRMARNA VI SÄLJER.
 *
 * En konfiguration är en hel inställningsfil för kioskappen, samma format som
 * ProMGR:s export. Plattformen håller namngivna konfigurationer i versioner,
 * och skärmen läser in sin med appens egen import, `importSettingsFile`.
 * Provat på den första skärmen 2026-10-26: importen sätter bara det som står
 * i filen och låter allt annat vara.
 *
 * HELA FILEN, även hemligheterna (produktägarens beslut 2026-10-26). PIN-koden,
 * lösenorden och volymnyckeln skiljs ut här och lagras krypterade, se
 * kiosk-config-store.ts. De visas aldrig i listor och skrivs aldrig i en logg.
 *
 * Ingenting stoppas, men det som kan stänga ute oss från en skärm ger en
 * varning innan det sparas, se `configWarnings`.
 *
 * Den här filen har inga importer: den läses av plattformens klientformulär
 * och testas utan databas.
 */

/** Nycklar vars värden är hemliga. Allt annat lagras som det står. */
export const SECRET_KEYS = [
  "kioskPin",
  "kioskPinEnc",
  "kioskWifiPin",
  "remoteAdminPassword",
  "remoteAdminPasswordEnc",
  "volumeLicenseKey",
  "wifiKey",
  "wifiEnterprisePassword",
  "authPassword",
  "mqttBrokerPassword",
  "clientCaPassword",
] as const;

const SECRET_SET: ReadonlySet<string> = new Set(SECRET_KEYS);

export function isSecretKey(key: string): boolean {
  return SECRET_SET.has(key);
}

/**
 * Nycklar som tas bort vid uppladdning.
 *
 * `volumeLicenseStatus` är appens besked om licensen och ingen inställning.
 * `customVariable` är vår: den bär versionen skärmen läst in, se CONFIG_MARKER.
 */
const DROPPED_KEYS: ReadonlySet<string> = new Set([
  "volumeLicenseStatus",
  "customVariable",
]);

export type ConfigValue = string | number | boolean;
export type ConfigValues = Record<string, ConfigValue>;

export interface ConfigParts {
  settings: ConfigValues;
  secrets: ConfigValues;
}

/** Större än så är inte en inställningsfil. Exporten är kring 15 kB. */
const MAX_UPLOAD_LENGTH = 200_000;

/** Läser en uppladdad eller inklistrad fil och skiljer ut hemligheterna. */
export function parseConfigUpload(text: string): ConfigParts | { error: string } {
  if (text.length > MAX_UPLOAD_LENGTH) {
    return { error: "Filen är för stor för att vara en inställningsfil." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "Det är inte giltig JSON. Klistra in hela exporten." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Filen ska vara ett JSON-objekt, som exporten från ProMGR." };
  }

  const values: ConfigValues = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (DROPPED_KEYS.has(key)) continue;
    if (typeof value === "string" || typeof value === "boolean") {
      values[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      values[key] = value;
    } else {
      return { error: `${key}: bara text, tal och av/på går att använda.` };
    }
  }

  if (Object.keys(values).length === 0) {
    return { error: "Filen innehåller inga inställningar." };
  }

  return splitSecrets(values);
}

export function splitSecrets(values: ConfigValues): ConfigParts {
  const settings: ConfigValues = {};
  const secrets: ConfigValues = {};

  for (const [key, value] of Object.entries(values)) {
    (isSecretKey(key) ? secrets : settings)[key] = value;
  }

  return { settings, secrets };
}

/**
 * Det skärmen läser in: inställningarna, hemligheterna och märket.
 *
 * Nycklarna sorteras, så att samma konfiguration alltid blir samma fil.
 */
export function buildConfigFile(parts: ConfigParts, versionId: string): ConfigValues {
  const all: ConfigValues = { ...parts.settings, ...parts.secrets };
  all.customVariable = markerFor(versionId);

  return Object.fromEntries(
    Object.keys(all)
      .sort()
      .map((key) => [key, all[key]])
  );
}

/**
 * VILKEN VERSION SKÄRMEN HAR, i appens fält `customVariable`.
 *
 * Skärmen läser av fältet och rapporterar det. Märket sätts av filen själv,
 * så det bevisar att just den filen lästs in, inte bara att den skickats.
 */
export const CONFIG_MARKER = "tikkr-config:";

export function markerFor(versionId: string): string {
  return `${CONFIG_MARKER}${versionId}`;
}

export function versionFromMarker(value: string | null | undefined): string | null {
  if (!value || !value.startsWith(CONFIG_MARKER)) return null;
  const id = value.slice(CONFIG_MARKER.length);
  return /^[a-z0-9]{10,40}$/i.test(id) ? id : null;
}

/**
 * Vilken konfiguration som gäller: skärmens egen, annars kundens, annars
 * standarden. Null när ingen finns, och då skickas ingenting.
 */
export function resolveConfigId(
  deviceConfigId: string | null,
  companyConfigId: string | null,
  defaultConfigId: string | null
): string | null {
  return deviceConfigId ?? companyConfigId ?? defaultConfigId;
}

function hostOf(url: ConfigValue | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

function isOff(value: ConfigValue | undefined): boolean {
  return value === false || value === "false";
}

/**
 * Det som kan stänga ute oss från en skärm, eller öppna den för fel person.
 *
 * Jämförs mot förra versionen, så att en varning bara kommer när något
 * ändras. `ourHosts` är värdarna skärmarna får peka på: portalens och den i
 * APP_URL.
 */
export function configWarnings(
  previous: ConfigParts | null,
  next: ConfigParts,
  ourHosts: string[]
): string[] {
  const warnings: string[] = [];
  const before = previous?.settings ?? {};
  const after = next.settings;

  const host = hostOf(after.startURL);
  const ours = ourHosts.map((value) => value.toLowerCase());
  if (
    host &&
    host !== hostOf(before.startURL) &&
    ours.length > 0 &&
    !ours.includes(host)
  ) {
    warnings.push(
      `Startadressen pekar på ${host} och inte på Tikkr. Skärmarna lämnar Tikkr och hämtar inga fler konfigurationer härifrån.`
    );
  }

  const switchedOff: [string, string][] = [
    ["websiteIntegration", "JavaScript-gränssnittet stängs av. Tikkr tappar fjärrstyrningen, även för nästa konfiguration."],
    ["kioskMode", "Kioskläget stängs av. Skärmen står öppen för den som går förbi."],
    ["mdmLockTask", "Lock Task Mode stängs av. Androids meny och andra appar går att nå."],
  ];
  for (const [key, text] of switchedOff) {
    if (isOff(after[key]) && !isOff(before[key])) warnings.push(text);
  }

  if (previous) {
    for (const [keys, text] of [
      [["kioskPin", "kioskPinEnc"], "PIN-koden ändras. Se till att du har den nya innan skärmarna läser in den."],
      [["remoteAdminPassword", "remoteAdminPasswordEnc"], "Remote Admin-lösenordet ändras."],
    ] as const) {
      if (keys.some((key) => previous.secrets[key] !== next.secrets[key])) {
        warnings.push(text);
      }
    }
  }

  return warnings;
}

/** Inställningarna som text för redigeraren, sorterade. */
export function settingsToText(settings: ConfigValues): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(settings)
        .sort()
        .map((key) => [key, settings[key]])
    ),
    null,
    2
  );
}
