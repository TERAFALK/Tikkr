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
};

export default nextConfig;
