import { PrismaClient } from "@prisma/client";

/**
 * Den råa databasklienten — UTAN företagsfiltrering.
 *
 * Namnet är avsiktligt obekvämt. Använd den aldrig för att läsa eller skriva
 * kunddata. Den finns bara för:
 *   - inloggning (vi vet inte vilket företag användaren tillhör förrän efteråt)
 *   - registrering av nytt företag
 *   - migrationer, seed och tester
 *
 * För allt annat: använd `forCompany()` i src/lib/tenant.ts.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const unsafeGlobalPrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// I utvecklingsläge laddas filer om hela tiden. Utan detta skulle varje omladdning
// skapa en ny databasanslutning tills databasen vägrar ta emot fler.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = unsafeGlobalPrisma;
}
