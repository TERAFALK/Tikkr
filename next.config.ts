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
  outputFileTracingIncludes: {
    "/api/admin/export/**": ["./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
