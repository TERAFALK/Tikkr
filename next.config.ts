import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" gör att Docker-imagen bara innehåller det appen faktiskt
  // behöver för att köra — betydligt mindre image och snabbare deploy.
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
