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
  ];
}
