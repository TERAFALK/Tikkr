import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Bara säljsidan. Resten kräver inloggning och hör inte hemma i ett index.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    // De rättsliga sidorna. Läses av den som utvärderar tjänsten, och ska gå
    // att hitta utan att först bli kund.
    ...["/villkor", "/integritetspolicy", "/personuppgiftsbitradesavtal"].map(
      (path) => ({
        url: `${base}${path}`,
        lastModified: new Date(),
        changeFrequency: "yearly" as const,
        priority: 0.3,
      })
    ),
  ];
}
