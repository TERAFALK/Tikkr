import type { NextConfig } from "next";

/**
 * CONTENT-SECURITY-POLICY, GRUNDNIVÅ (beslutat 2026-10-18, produktägarens val,
 * säkerhetsgranskningen).
 *
 * Skript, stilar, bilder, typsnitt och anrop bara från egen adress. Inga
 * plugins, ingen annan bas för relativa länkar, och formulär skickas bara hit
 * eller till Stripes kassa och kundportal, dit prenumerationssidan skickar
 * vidare. Ingen annan sajt får rama in sidorna, samma sak som
 * X-Frame-Options nedan säger för äldre webbläsare.
 *
 * INLINE-SKRIPT TILLÅTS. Next lägger sina egna i varje sida, och utan dem
 * krävs en nonce, som i sin tur kräver att varje sida renderas vid varje
 * anrop, även säljsidan. Det valdes bort. Policyn stoppar därmed inte ett
 * injicerat inline-skript, men väl ett som hämtas utifrån, och React escapar
 * redan allt som ritas.
 *
 * I utvecklingsläge behöver React `eval` och omladdningen en websocket.
 */
function contentSecurityPolicy(development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${development ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  ].join("; ");
}

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
      {
        // Bara sidorna, inte /api. Policyn gäller dokument som ritar något,
        // och på ett PDF-svar kan `object-src 'none'` hindra webbläsarens egen
        // PDF-visare, som utskriftsknappen laddar i en ram.
        source: "/((?!api/).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(process.env.NODE_ENV === "development"),
          },
        ],
      },
    ];
  },

  /**
   * GAMLA ADRESSER I PANELEN.
   *
   * Registren som sätts upp en gång flyttades till Inställningar 2026-10-14
   * (issue #17). Bokmärken, öppna flikar och länkar i gamla mejl ska fortsätta
   * fungera. Inte permanenta: en 308 sparas av webbläsaren, och skulle en sida
   * flytta igen hade den gamla omdirigeringen stått kvar hos varje kund.
   */
  async redirects() {
    return [
      ["/admin/moment", "/admin/installningar/arbetsmoment"],
      ["/admin/improduktivt", "/admin/installningar/improduktivt"],
      ["/admin/skarmar", "/admin/installningar/skarmar"],
      ["/admin/planering/stationer", "/admin/installningar/stationer"],
    ].map(([source, destination]) => ({ source, destination, permanent: false }));
  },
};

export default nextConfig;
