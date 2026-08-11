import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Vad sökmotorer får titta på.
 *
 * Säljsidan ska hittas. Adminpanelen, stämplingsskärmen och
 * plattformspanelen ska inte — de kräver inloggning ändå, men en adress som
 * dyker upp i ett sökresultat är en inbjudan att försöka.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/kiosk", "/plattform", "/registrera", "/api"],
    },
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
