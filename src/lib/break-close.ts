import type { BreakEntry } from "@prisma/client";
import type { CompanyDb } from "./tenant";

/**
 * AVSLUTAR EN PÅGÅENDE RAST.
 *
 * Ligger i en egen fil, och det är inte godtyckligt. `clock.ts` behöver den,
 * eftersom en instämpling avslutar rasten, och `breaks.ts` behöver `clock.ts`
 * för att ett rasttryck ska stänga jobben. Låg funktionen i `breaks.ts` skulle
 * filerna importera varandra, och en cirkel mellan två moduler som båda kör
 * kod vid inladdning är en bugg som visar sig först i drift.
 */
export async function endOpenBreak(
  db: CompanyDb,
  employeeId: string,
  at: Date
): Promise<BreakEntry | null> {
  const open = await db.breakEntry.findFirst({
    where: { employeeId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (!open) return null;

  // En rast som skulle sluta FÖRE den började lämnas orörd. Då är trycket ett
  // gammalt ur offline-kön, och att stänga rasten baklänges vore att hitta på
  // en negativ tid.
  if (open.startedAt > at) return null;

  // `endedAt: null` i villkoret av samma skäl som stämplingarna: hinner något
  // annat stänga rasten däremellan ska den tiden gälla, inte vår.
  const { count } = await db.breakEntry.updateMany({
    where: { id: open.id, endedAt: null },
    data: { endedAt: at },
  });

  if (count === 0) return null;

  return db.breakEntry.findUnique({ where: { id: open.id } });
}
