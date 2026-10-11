import type { MetadataRoute } from "next";
import { helpSiteUrl, siteUrl } from "@/lib/site-url";
import { LEGAL_UPDATED_AT } from "@/lib/legal";
import { GUIDES, guideHref } from "@/lib/help/guides";

// Säljsidan och hjälpcentret. Resten kräver inloggning och hör inte hemma i
// ett index.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];

  const help = helpSiteUrl();

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
    // Hjälpcentret. Ligger på support.tikkr.se när SUPPORT_HOST är satt, och
    // adresserna står då med den värden. Båda adresserna behöver vara
    // verifierade hos sökmotorn för att den ska godta listan.
    ...helpPaths().map((path) => ({
      url: `${help ?? base}${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}

function helpPaths(): string[] {
  return ["/hjalp", ...GUIDES.map((guide) => guideHref(guide.slug))];
}
