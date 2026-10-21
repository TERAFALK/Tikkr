import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { LEGAL_UPDATED_AT } from "@/lib/legal";
import { GUIDES, guideHref } from "@/lib/help/guides";
import { listProducts } from "@/lib/shop/products";

// Säljsidan och hjälpcentret. Resten kräver inloggning och hör inte hemma i
// ett index.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  if (!base) return [];

  // Produkterna ligger i databasen. Svarar den inte står kartan utan dem,
  // hellre än att inte gå att hämta alls.
  const products = await listProducts("site").catch(() => []);

  return [
    {
      /*
        Snedstrecket står med flit. Canonical blir `base + "/"`, och pekar de
        två på olika strängar för samma sida är det en motsägelse vi skickar
        till sökmotorn helt i onödan.
      */
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    // De rättsliga sidorna. Läses av den som utvärderar tjänsten, och ska gå
    // att hitta utan att först bli kund.
    //
    // Datumet är det dokumenten faktiskt ändrades, inte dagens. Stod det
    // dagens rapporterade alla fyra sidorna "ändrad nyss" vid varje hämtning,
    // och en sökmotor som upptäcker att det inte stämmer slutar lita på
    // uppgiften — även för startsidan, där den är sann.
    ...["/villkor", "/integritetspolicy", "/personuppgiftsbitradesavtal"].map(
      (path) => ({
        url: `${base}${path}`,
        lastModified: LEGAL_UPDATED_AT,
        changeFrequency: "yearly" as const,
        priority: 0.3,
      })
    ),
    // Tillbehören, butiken och en sida per produkt.
    ...["/tillbehor", ...products.map((product) => `/tillbehor/${product.slug}`)].map(
      (path) => ({
        url: `${base}${path}`,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })
    ),
    // Hjälpcentret. Publikt, och det kunden söker på när något inte går.
    ...helpPaths().map((path) => ({
      url: `${base}${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}

function helpPaths(): string[] {
  return ["/support", ...GUIDES.map((guide) => guideHref(guide.slug))];
}
