import { describe, expect, it } from "vitest";
import { paragraphs, parseBenefits, parseSpecs } from "@/lib/shop/catalog";
import { keyFromSlug, readProductForm, slugify, sniffImageType } from "@/lib/shop/product-admin";

/**
 * PRODUKTERNA SOM PLATTFORMEN LÄGGER UPP.
 *
 * Det som måste hålla:
 *   formuläret ger en produkt med pris i öre, eller ett fel att rätta
 *   listorna läses i den ordning de står, och tomma rader faller bort
 *   adressen och nyckeln bildas förutsägbart
 *   en bild godtas efter sitt innehåll, inte efter vad den påstår sig vara
 *   en trasig JSON-rad fäller inte produktsidan
 *
 * Behöver ingen databas.
 */

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

const MINIMAL = { name: "Utbildning för administratörer", summary: "En timme med oss.", price: "4 500" };

describe("formuläret", () => {
  it("ger en produkt med pris i öre och adress ur namnet", () => {
    const { input, error } = readProductForm(form({ ...MINIMAL, kind: "SERVICE", inShop: "on" }));

    expect(error).toBeNull();
    expect(input).toMatchObject({
      name: "Utbildning för administratörer",
      slug: "utbildning-for-administratorer",
      kind: "SERVICE",
      priceOre: 450_000,
      vatRatePercent: 25,
      maxQuantity: 20,
      inShop: true,
      onSite: false,
    });
  });

  it("läser listorna i ordning och hoppar över tomma rader", () => {
    const { input } = readProductForm(
      form({
        ...MINIMAL,
        benefitTitle: ["Snabbt", "", "Tryggt"],
        benefitBody: ["På en timme.", "", "Med oss."],
        included: ["Material", "", "Intyg"],
        specGroup: ["Skärm", "Skärm", "Dator"],
        specLabel: ["Storlek", "Upplösning", "Minne"],
        specValue: ["23,6 tum", "1920 × 1080", "4 GB"],
      })
    );

    expect(input?.benefits).toEqual([
      { title: "Snabbt", body: "På en timme." },
      { title: "Tryggt", body: "Med oss." },
    ]);
    expect(input?.included).toEqual(["Material", "Intyg"]);
    expect(input?.specs).toEqual([
      {
        title: "Skärm",
        rows: [
          { label: "Storlek", value: "23,6 tum" },
          { label: "Upplösning", value: "1920 × 1080" },
        ],
      },
      { title: "Dator", rows: [{ label: "Minne", value: "4 GB" }] },
    ]);
  });

  it("avvisar det som saknas eller är fel", () => {
    for (const fields of [
      { ...MINIMAL, name: "" },
      { ...MINIMAL, summary: "" },
      { ...MINIMAL, price: "" },
      { ...MINIMAL, price: "0" },
      { ...MINIMAL, price: "2000000" },
      { ...MINIMAL, slug: "Med Mellanslag" },
      { ...MINIMAL, vatRatePercent: "20" },
      { ...MINIMAL, maxQuantity: "0" },
      { ...MINIMAL, specGroup: ["Skärm"], specLabel: ["Storlek"], specValue: [""] },
    ]) {
      expect(readProductForm(form(fields)).error, JSON.stringify(fields)).not.toBeNull();
    }
  });
});

describe("adressen och nyckeln", () => {
  it("bildas ur namnet och adressen", () => {
    expect(slugify("Stämplingsskärm 24\"")).toBe("stamplingsskarm-24");
    expect(slugify("  --Kurs, del 2--  ")).toBe("kurs-del-2");
    expect(keyFromSlug("stamplingsskarm-24")).toBe("STAMPLINGSSKARM_24");
  });
});

describe("bilderna", () => {
  it("känns igen på sitt innehåll", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))
    ).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});

describe("listorna ur databasen", () => {
  it("hoppar över det som inte har formen", () => {
    expect(parseBenefits([{ title: "A", body: "B" }, null, 3, { title: "", body: "" }])).toEqual([
      { title: "A", body: "B" },
    ]);
    expect(parseBenefits("inte en lista")).toEqual([]);
    expect(
      parseSpecs([
        { title: "Skärm", rows: [{ label: "Storlek", value: "23,6 tum" }, { label: "Tom" }] },
        { title: "Tom grupp", rows: [] },
        "trasig",
      ])
    ).toEqual([{ title: "Skärm", rows: [{ label: "Storlek", value: "23,6 tum" }] }]);
  });

  it("delar beskrivningen i stycken vid tomma rader", () => {
    expect(paragraphs("Ett.\n\nTvå\nrader.\n  \nTre.")).toEqual(["Ett.", "Två\nrader.", "Tre."]);
    expect(paragraphs("")).toEqual([]);
  });
});
