import { notFound } from "next/navigation";
import type { AdminSession } from "./admin-session";
import { unsafeGlobalPrisma } from "./db";
import { MODULE_KEYS, isModuleKey, type ModuleKey } from "./modules";

/**
 * VILKA TILLVAL ETT FÖRETAG HAR.
 *
 * Registret över vad modulerna ÄR ligger i `modules.ts` och är beroendefritt.
 * Här ligger uppslaget mot databasen och grinden.
 *
 * Läget läses via `unsafeGlobalPrisma` och inte via företagsklienten, av
 * samma skäl som `Company` gör det: det beskriver avtalet mellan oss och
 * kunden, inte kundens egen data, och det måste gå att läsa från webhooken
 * och plattformspanelen där ingen session finns. Tabellen är ändå
 * tenant-scopad i `tenant.ts`, så att en kundklient som råkar läsa den bara
 * ser sina egna rader.
 */

/**
 * INGEN CACHE HÄR, MED FLIT.
 *
 * Frågan är ett indexerat uppslag på en tabell med en rad per företag, och
 * den ställs bara där den behövs — panelens layout läser modulerna i den
 * fråga som ändå hämtar företaget, och kioskens stämpling slår bara upp dem
 * för de tryck som rör raster.
 *
 * Ett kort minne hade sparat de frågorna och i utbyte gett två saker att
 * hålla reda på: ett fönster där en avstängd modul fortfarande går att nå,
 * och ett minne per process som inte töms när en annan process skriver. Det
 * är fel byte för en tabell av den här storleken.
 */
export async function enabledModules(companyId: string): Promise<ModuleKey[]> {
  const rows = await unsafeGlobalPrisma.companyModule.findMany({
    where: { companyId },
    select: { module: true },
  });

  // Filtrerar mot registret. En rad med en nyckel koden inte känner igen kan
  // uppstå när en modul plockas bort ur registret men raden ligger kvar, och
  // då ska den behandlas som avstängd — inte krascha en sidladdning.
  return rows.map((row) => row.module).filter(isModuleKey);
}

export async function hasModule(
  companyId: string,
  key: ModuleKey
): Promise<boolean> {
  return (await enabledModules(companyId)).includes(key);
}

/**
 * Grinden. Kallas i varje sida, åtgärd och rutt som hör till en modul.
 *
 * SVARAR 404, INTE EN LÅSSKÄRM. En direktlänk till något kunden inte har ska
 * se ut som att sidan inte finns. Ett "du saknar behörighet" bekräftar att
 * den gör det, och prenumerationslåset visar redan en förklaring på den nivå
 * där en förklaring hjälper.
 *
 * Supportläget släpps INTE igenom, till skillnad från prenumerationslåset.
 * Där handlar det om en obetald faktura, som ofta är just varför kunden
 * ringer. Här handlar det om funktioner kunden inte köpt, och en supportvy
 * som visar mer än kunden har gör supporten sämre, inte bättre.
 *
 * Bevisas av `tests/module-coverage.test.ts`: varje fil som rör en modul ska
 * ha en vakt, och testet letar upp dem ur importer och tabellnamn i stället
 * för att lita på en lista någon håller uppdaterad.
 */
export async function requireModule(
  session: AdminSession,
  key: ModuleKey
): Promise<void> {
  if (await hasModule(session.companyId, key)) return;
  notFound();
}

/**
 * Slår på eller av en modul för hand.
 *
 * Används av plattformspanelen, och av kundens eget reglage när Stripe inte
 * är påkopplat. Företag med en levande prenumeration styrs av webhooken i
 * stället — annars hamnar vår databas och fakturan isär.
 *
 * Avstängning raderar raden och ingenting annat. Kundens scheman, raster,
 * frånvaro och komprader ligger kvar.
 */
export async function setModuleManually(params: {
  companyId: string;
  key: ModuleKey;
  on: boolean;
  actorEmail: string;
}): Promise<void> {
  if (params.on) {
    await unsafeGlobalPrisma.companyModule.upsert({
      where: {
        companyId_module: { companyId: params.companyId, module: params.key },
      },
      create: {
        companyId: params.companyId,
        module: params.key,
        source: "MANUAL",
        enabledBy: params.actorEmail,
      },
      // Redan på: lämna raden som den är. Att skriva om källan skulle kunna
      // göra en Stripe-rad manuell, och då slutar fakturan styra.
      update: {},
    });
  } else {
    await unsafeGlobalPrisma.companyModule.deleteMany({
      where: { companyId: params.companyId, module: params.key },
    });
  }
}

/** Alla moduler med läge, för plattformspanelen och kundens tillvalssida. */
export interface ModuleState {
  key: ModuleKey;
  enabled: boolean;
  source: "STRIPE" | "MANUAL" | null;
  enabledBy: string | null;
  enabledAt: Date | null;
}

export async function moduleStates(companyId: string): Promise<ModuleState[]> {
  const rows = await unsafeGlobalPrisma.companyModule.findMany({
    where: { companyId },
  });

  return MODULE_KEYS.map((key) => {
    const row = rows.find((item) => item.module === key);

    return {
      key,
      enabled: Boolean(row),
      source: row?.source ?? null,
      enabledBy: row?.enabledBy ?? null,
      enabledAt: row?.enabledAt ?? null,
    };
  });
}
