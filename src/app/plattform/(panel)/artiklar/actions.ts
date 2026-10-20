"use server";

import { revalidatePath } from "next/cache";
import { saved, type SaveState } from "@/lib/save-state";
import {
  recordPlatformAction,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import {
  SCREEN_ITEM,
  setStoredPrice,
  type PriceItem,
} from "@/lib/price-book";
import { isModuleKey } from "@/lib/modules";
import { forgetPricing, hasStripeKey, stripe } from "@/lib/stripe";

/**
 * SPARAR ARTIKELNUMREN FÖR EN SAK VI SÄLJER.
 *
 * Numren kontrolleras mot Stripe innan de sparas, när nyckeln finns. Det är
 * hela skälet att flytta dem hit från en fil på servern: ett felklistrat
 * nummer i en .env upptäcks först när en kund står i kassan och den inte
 * öppnar. Här upptäcks det direkt, och svaret säger vad artikeln kostar så att
 * det går att se att det blev den rätta.
 */
export async function savePrices(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const { email } = await requirePlatformAdmin();

  const raw = String(formData.get("item") ?? "");
  const month = String(formData.get("month") ?? "").trim();
  const year = String(formData.get("year") ?? "").trim();

  // Smalnas av till PriceItem här, så att resten av funktionen inte behöver
  // en typomskrivning för något som redan är kontrollerat.
  const item: PriceItem | null =
    raw === SCREEN_ITEM ? SCREEN_ITEM : isModuleKey(raw) ? raw : null;

  if (!item) return { error: "Okänd artikel." };

  for (const [value, label] of [
    [month, "Månad"],
    [year, "År"],
  ] as const) {
    if (value && !value.startsWith("price_")) {
      return {
        error: `${label}: ett artikelnummer börjar med price_. Produktnummer (prod_) och länkar går inte att använda.`,
      };
    }
  }

  const checked: string[] = [];

  if (hasStripeKey()) {
    for (const [value, wanted, label] of [
      [month, "month", "Månad"],
      [year, "year", "År"],
    ] as const) {
      if (!value) continue;

      try {
        const price = await stripe().prices.retrieve(value);
        const interval = price.recurring?.interval;

        if (!interval) {
          return {
            error: `${label}: artikeln är ett engångspris och går inte att använda för en prenumeration.`,
          };
        }

        // Ett årspris i månadsfältet är den lätta felklistringen, och den ger
        // en faktura tolv gånger för dyr. Den ska inte gå att spara.
        if (interval !== wanted) {
          return {
            error: `${label}: artikeln debiteras per ${
              interval === "year" ? "år" : "månad"
            }. Byt plats på fälten.`,
          };
        }

        if (price.unit_amount !== null && price.unit_amount !== undefined) {
          checked.push(`${label} ${price.unit_amount / 100} kr`);
        }
      } catch (error) {
        console.error(
          "[artiklar] Kunde inte läsa artikeln hos Stripe:",
          error instanceof Error ? error.message : error
        );

        return {
          error: `${label}: artikeln finns inte hos Stripe, eller nyckeln hör till ett annat konto.`,
        };
      }
    }
  }

  await setStoredPrice({
    item,
    month: month || null,
    year: year || null,
    actorEmail: email,
  });

  // Priserna i kronor ligger i ett tiominutersminne. Utan den här raden hade
  // en rättad artikel inte synts förrän minnet gått ut, och den som just
  // rättade ett fel hade trott att rättelsen inte tog.
  forgetPricing();

  await recordPlatformAction({
    actorEmail: email,
    action: "Ändrade artikelnummer",
    detail: [item, month || "(tomt)", year || "(tomt)"].join(" · "),
  });

  revalidatePath("/plattform/artiklar");

  // Beloppet står med i beskedet när det gick att läsa. Att se "Månad 399 kr"
  // är enda sättet att veta att man klistrat in rätt artikel.
  return saved(checked.length > 0 ? checked.join(", ") : undefined);
}
