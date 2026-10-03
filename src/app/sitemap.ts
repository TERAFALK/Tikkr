import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { LEGAL_UPDATED_AT } from "@/lib/legal";

// Bara säljsidan. Resten kräver inloggning och hör inte hemma i ett index.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];

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
  ];
}
