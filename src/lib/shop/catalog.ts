/**
 * TILLBEHÖREN VI SÄLJER.
 *
 * Katalogen ligger i koden, som guiderna i hjälpcentret och modulregistret.
 * En produktbeskrivning ska ändras i samma commit som det den beskriver, och
 * en text i en databastabell hade kunnat lova något som ingen granskning sett.
 *
 * BARA PRISET LIGGER OCKSÅ I DATABASEN, i `shop_prices`, så att det går att
 * ändra under Artiklar i plattformspanelen utan en driftsättning. Beloppet här
 * är reserven när ingen rad finns. Läs priset med `shopPrices()` i prices.ts,
 * aldrig härifrån, annars kan två sidor visa olika belopp.
 *
 * EN NY PRODUKT är en ny nyckel och en ny post nedan. Butiken, formuläret,
 * plattformens sidor och mejlen är skrivna över `PRODUCT_KEYS` och behöver
 * inte röras.
 *
 * Filen har inga importer och ska inte få några: säljsidan, panelen och
 * plattformen läser den alla.
 *
 * TEXTERNA FÖLJER TONE-OF-VOICE.md. Tillverkarens namn och modellbeteckning
 * står aldrig här: produkten säljs som Tikkrs. Specifikationerna är avstämda
 * mot tillverkarens datablad för artikeln, se docs/kioskskarm.md. Det som inte
 * är bekräftat står inte med, därför ingen Android-version.
 */

export const PRODUCT_KEYS = ["STAMPLINGSSKARM"] as const;

export type ProductKey = (typeof PRODUCT_KEYS)[number];

export function isProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && (PRODUCT_KEYS as readonly string[]).includes(value);
}

export interface ProductImage {
  /** Under `public/`. Byt filen för att byta bilden. */
  src: string;
  alt: string;
  /**
   * true för en ritad bild. Märks "Illustration" på sidan, så att en ritning
   * aldrig kan tas för ett foto av det kunden får. Sätts till false när ett
   * riktigt foto lagts på samma plats.
   */
  illustration: boolean;
}

export interface SpecGroup {
  title: string;
  rows: { label: string; value: string }[];
}

export interface Product {
  key: ProductKey;
  /** Adressen under /tillbehor. */
  slug: string;
  name: string;
  /** En mening, under namnet i butiken. */
  summary: string;
  /** Stycken på produktsidan. */
  description: string[];
  /** Pris exklusive moms i öre, när ingen rad finns i shop_prices. */
  fallbackPriceOre: number;
  vatRatePercent: number;
  /** Högsta antal på en beställning. Fler än så tas per telefon. */
  maxQuantity: number;
  /** Visas vid priset och i orderbekräftelsen. */
  delivery: string;
  benefits: { title: string; body: string }[];
  included: string[];
  requirements: string[];
  specs: SpecGroup[];
  warranty: string;
  images: ProductImage[];
}

export const PRODUCTS: Record<ProductKey, Product> = {
  STAMPLINGSSKARM: {
    key: "STAMPLINGSSKARM",
    slug: "stamplingsskarm",
    name: "Stämplingsskärm",
    summary:
      "Pekskärm på 23,6 tum i stativ, uppsatt för Tikkr och klar att ansluta.",
    description: [
      "En stämplingsskärm som är uppsatt och provad innan den lämnar oss. Ni ansluter ström och nätverkskabel och kopplar den till er arbetsyta med en kod från panelen.",
      "Skärmen visar bara stämplingen och startar i den av sig själv. Den är fläktlös och utformad för att stå på dygnet runt.",
    ],
    fallbackPriceOre: 2_490_000,
    vatRatePercent: 25,
    maxQuantity: 20,
    delivery:
      "Tillverkas på beställning. Beräknad leveranstid 3–4 veckor.",
    benefits: [
      {
        title: "Klar att ansluta",
        body: "Uppsatt och provad före leverans. Ström, nätverkskabel och en kod från panelen, sedan går det att stämpla.",
      },
      {
        title: "Bara stämplingen",
        body: "Skärmen startar direkt i stämplingen när strömmen slås på, även efter ett strömavbrott, och visar ingenting annat.",
      },
      {
        title: "Fortsätter utan nätverk",
        body: "Tappar skärmen anslutningen sparas stämplingarna på skärmen och skickas när anslutningen är tillbaka.",
      },
      {
        title: "Styrs från panelen",
        body: "Under Stämplingsskärmar syns serienummer, anslutning och senaste kontakt. Där ändras ljusstyrkan och skärmen startas om.",
      },
      {
        title: "Byggd för att stå på",
        body: "Fläktlös, utan batteri och utformad för drift dygnet runt.",
      },
      {
        title: "Stativ ingår",
        body: "Pulverlackerat stativ. Skärmen har även VESA 100 för väggfäste.",
      },
    ],
    included: [
      "Pekskärm 23,6 tum",
      "Pulverlackerat stativ",
      "Nätadapter 12 V",
      "Uppsättning och provning före leverans",
      "Tre års garanti på skärm och stativ",
    ],
    requirements: [
      "Eluttag vid skärmen",
      "Nätverksuttag vid skärmen. Wi-Fi fungerar också, men kabel rekommenderas",
      "En licens i prenumerationen per skärm",
    ],
    specs: [
      {
        title: "Skärm",
        rows: [
          { label: "Storlek", value: "23,6 tum" },
          { label: "Upplösning", value: "1920 × 1080" },
          { label: "Pekskärm", value: "Kapacitiv, tio samtidiga tryck" },
          { label: "Ljusstyrka", value: "250 cd/m²" },
          { label: "Glas", value: "Reflexfritt, 2 mm" },
        ],
      },
      {
        title: "Dator",
        rows: [
          { label: "Processor", value: "Rockchip RK3399" },
          { label: "Minne", value: "4 GB" },
          { label: "Lagring", value: "16 GB" },
          { label: "Operativsystem", value: "Android" },
        ],
      },
      {
        title: "Nätverk",
        rows: [
          { label: "Kabel", value: "Gigabit Ethernet (RJ45), rekommenderas" },
          { label: "Wi-Fi", value: "802.11 a/b/g/n" },
          { label: "Nätverksinloggning", value: "IEEE 802.1X" },
        ],
      },
      {
        title: "Ström och mått",
        rows: [
          { label: "Strömförsörjning", value: "12 V nätadapter, ingår" },
          { label: "Effekt", value: "40–60 W" },
          { label: "Mått utan stativ", value: "576 × 345 × 44 mm" },
          { label: "Vikt utan stativ", value: "7,2 kg" },
          { label: "Montering", value: "VESA 100" },
          { label: "Drifttemperatur", value: "0–40 °C" },
          { label: "Kylning", value: "Fläktlös" },
        ],
      },
    ],
    warranty:
      "Tre års garanti på skärm och stativ mot fel i material och tillverkning, räknat från leveransen. Gäller inte skador av yttre åverkan eller användning utanför specifikationen.",
    images: [
      {
        src: "/tillbehor/stamplingsskarm/framifran.svg",
        alt: "Stämplingsskärmen i sitt stativ, framifrån",
        illustration: true,
      },
      {
        src: "/tillbehor/stamplingsskarm/verkstad.svg",
        alt: "Stämplingsskärmen vid en vägg i en verkstad",
        illustration: true,
      },
      {
        src: "/tillbehor/stamplingsskarm/detalj.svg",
        alt: "Skärmens kant och stativets infästning",
        illustration: true,
      },
    ],
  },
};

export function productBySlug(slug: string): Product | null {
  return PRODUCT_KEYS.map((key) => PRODUCTS[key]).find((p) => p.slug === slug) ?? null;
}

/** Produkterna i katalogens ordning. */
export function allProducts(): Product[] {
  return PRODUCT_KEYS.map((key) => PRODUCTS[key]);
}
