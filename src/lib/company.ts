import { unsafeGlobalPrisma } from "./db";

/**
 * Företagets egna inställningar.
 *
 * `companies` är tabellen som BÄR company_id och kan därför inte hämtas genom
 * det tenant-filtrerade lagret — där finns inget att filtrera på. Uppslaget
 * går via `unsafeGlobalPrisma` med ett uttryckligt `id`, vilket är det enda
 * stället i appen där det är rätt svar.
 */

/** Tidszonen att räkna dygns- och veckogränser i. Aldrig serverns egen. */
export const DEFAULT_TIME_ZONE = "Europe/Stockholm";

/**
 * Företagets tidszon, med svensk tid som fallback.
 *
 * Finns samlat för att "idag" ska betyda samma sak i hela panelen. Uppslaget
 * låg tidigare kopierat i varje vy som behövde det, och en vy som glömde det
 * räknade i serverns tidszon — alltså UTC, alltså 02:00 på verkstadsgolvet.
 * Det syns inte i någon vy för sig, bara när två av dem jämförs.
 */
export async function companyTimeZone(companyId: string): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });

  return company?.timezone ?? DEFAULT_TIME_ZONE;
}
