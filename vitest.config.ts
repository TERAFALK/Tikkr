import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Vägrar starta mot en databas som inte heter något med _test. Se
    // tests/setup.ts — testerna raderar företag, och den spärren måste
    // sitta här och inte bara i skriptet som brukar användas.
    setupFiles: ["./tests/setup.ts"],
    // Databastesterna delar samma databas och skulle trampa på varandra
    // om de kördes samtidigt.
    fileParallelism: false,
    testTimeout: 20000,
  },
  // JSX översätts av testerna själva. tsconfig säger "preserve", eftersom
  // Next vill ha JSX orörd, och vitest 4 följer den inställningen. Ett test som
  // importerar en komponent, som employees.test.ts, föll då på JSX-syntaxen.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
