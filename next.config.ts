import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" gör att Docker-imagen bara innehåller det appen faktiskt
  // behöver för att köra — betydligt mindre image och snabbare deploy.
  output: "standalone",
  reactStrictMode: true,

  // PDF-biblioteket laddar teckensnittsdata från filer i sitt eget paket vid
  // körning. Next tar bara med filer den ser att koden importerar, och de här
  // hittas inte automatiskt — utan raden nedan fungerar PDF-export i
  // utvecklingsläge men kraschar i den byggda imagen.
  // PDF-biblioteket läser sina teckensnittsfiler från disk, relativt sin egen
  // plats. Bakas det in i rutten flyttas den platsen, och det letar då efter
  // filerna bredvid den bundlade koden där de inte finns:
  //   ENOENT ... /app/.next/server/app/api/admin/export/orders/data/Helvetica.afm
  //
  // Att ta med filerna i bygget löser det alltså inte — de hamnar på fel
  // ställe. Biblioteket måste lämnas utanför bunten så att det ligger kvar i
  // node_modules och hittar sina filer där.
  serverExternalPackages: ["pdfkit"],

  outputFileTracingIncludes: {
    "/api/admin/export/orders/route": ["./node_modules/pdfkit/js/data/**"],
  },

  /**
   * SÄKERHETSHEADERS PÅ VARJE SVAR.
   *
   * Sätts i appen och inte i proxyn, så att de följer med oavsett om Tikkr
   * står bakom Nginx Proxy Manager i labbet eller Caddy i produktion.
   *
   *   X-Frame-Options       Ingen annan sajt får rama in panelen och lura
   *                         någon att klicka på "Anonymisera" genom en
   *                         genomskinlig ruta. SAMEORIGIN och inte DENY:
   *                         utskriftsknappen laddar underlaget i en egen ram.
   *   nosniff               En uppladdad bild tolkas som bild, aldrig som
   *                         skript.
   *   Referrer-Policy       En återställningslänk bär sin token i adressen.
   *                         Den ska inte följa med till en annan sajt.
   *   Permissions-Policy    Tikkr använder varken kamera, mikrofon eller
   *                         position, och ingen inbäddad kod ska kunna be om
   *                         dem.
   *   HSTS                  Webbläsaren använder bara HTTPS mot adressen ett
   *                         år framåt. Ignoreras över vanlig http, alltså
   *                         ofarlig i labbet.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
