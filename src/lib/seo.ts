import type { Metadata } from "next";
import { siteUrl } from "./site-url";

/**
 * METADATA FÖR DE PUBLIKA SIDORNA, PÅ ETT STÄLLE.
 *
 * Varför en funktion och inte ett objekt per sida: Next slår samman metadata
 * GRUNT. Sätter en sida sin egen `openGraph` ersätts rot-layoutens i sin helhet
 * — fält för fält ärvs ingenting. En sida som anger `openGraph` utan `images`
 * får alltså ingen delningsbild, trots att layouten ovanför har en.
 *
 * Det hände, och var svårt att se av två skäl:
 *
 * 1. Säljsidan satte aldrig `twitter`, så det kortet fortsatte fungera. X visade
 *    rätt bild medan LinkedIn, Teams och Slack visade en naken länk. En kontroll
 *    i X gav grönt ljus på en trasig sida.
 * 2. Sidans `openGraph` låg inne i ett villkor på MARKETING_HOST. I labbet, där
 *    variabeln saknas, gällde rot-layoutens kompletta objekt MED bild. Felet
 *    fanns bara i produktion.
 *
 * Därför bygger ingen sida sin metadata för hand. `tests/seo.test.ts` fäller den
 * som försöker.
 */

/**
 * Delningsbilden.
 *
 * Hämtad ur varumärkesmaterialets delningsbild, se `brand/03-social/`. Måttet
 * står utskrivet eftersom LinkedIn och Facebook beskär bilden själva om de inte
 * vet hur stor den är, och då hamnar ordmärket utanför.
 */
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 627,
  alt: "Tikkr",
} as const;

export interface PageMeta {
  /** Står i webbläsarfliken och i sökresultatet. */
  title: string;
  /** Står under rubriken i sökresultatet. */
  description: string;
  /** Sidans adress med inledande snedstreck. Startsidan är "/". */
  path: string;
  /**
   * Texten i delningskortet, när den ska skilja sig från beskrivningen ovan.
   *
   * Sökresultatet tål en längre mening än ett kort i ett chattfönster, där
   * raden klipps efter ett par rader ändå.
   */
  shareDescription?: string;
}

export function pageMetadata({
  title,
  description,
  path,
  shareDescription,
}: PageMeta): Metadata {
  const base = siteUrl();
  const share = shareDescription ?? description;

  return {
    title,
    description,

    /*
      Talar om vilken adress som är den riktiga. Utan den kan tikkr.se och
      www.tikkr.se räknas som två sidor med samma innehåll, och deras värde
      delas upp på båda i stället för att samlas på en.

      Utelämnas när MARKETING_HOST saknas: då finns ingen publik adress att peka
      ut, och en gissning vore sämre än tystnad.
    */
    ...(base && { alternates: { canonical: path } }),

    openGraph: {
      type: "website",
      locale: "sv_SE",
      siteName: "Tikkr",
      title,
      description: share,
      images: [OG_IMAGE],
      ...(base && { url: `${base}${path}` }),
    },

    twitter: {
      card: "summary_large_image",
      title,
      description: share,
      images: [OG_IMAGE.url],
    },
  };
}
