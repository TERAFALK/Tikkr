import type { CompanyDb } from "./tenant";

/**
 * BERÄKNAD TID PER ARBETSMOMENT.
 *
 * Administratören lägger till en rad i taget: ett arbetsmoment och hur lång
 * tid det beräknas ta. Orderns totala beräkning är summan av raderna och
 * lagras ingenstans — se OrderBudget i schema.prisma.
 *
 * Hela läsningen av formuläret och hela skrivningen ligger här, så att
 * skapa-rutan och ändra-rutan inte kan komma att tolka samma fält på två sätt.
 *
 * RADERNAS ORDNING ÄR EN UPPGIFT, inte en slump. Den säger i vilken följd
 * momenten ska göras, och planeringen ritar pilar efter den. Ordningen kommer
 * ur formuläret och inte ur ett eget fält: webbläsaren skickar fälten i den
 * ordning de står på skärmen.
 */

/** En rad: ett arbetsmoment, dess beräknade tid, och dess plats i ordningen. */
export interface BudgetRow {
  momentId: string;
  minutes: number;
  /**
   * I vilken ordning momentet ska göras. Noll först.
   *
   * Kommer ur radernas ordning i formuläret och inte ur ett eget fält.
   * Webbläsaren skickar fälten i den ordning de står på skärmen, så den som
   * flyttat en rad uppåt har redan sagt vad hen menar.
   */
  sortOrder: number;
}

/** Namnen på fälten i formuläret. En rad skriver ett värde i vardera. */
export const BUDGET_MOMENT_FIELD = "budgetMomentId";
export const BUDGET_HOURS_FIELD = "budgetHours";

/**
 * Läser ett timfält och ger minuter.
 *
 * Administratören tänker i timmar, systemet räknar i minuter.
 *
 * TAR BÅDA FORMEN: "7:30" och "7,5". Systemet VISAR tim:min överallt, och det
 * vore oanständigt att kräva att man räknar om det till decimaltimmar för att
 * skriva tillbaka samma tal. Decimalformen står kvar eftersom en rund siffra
 * är enklare att skriva: "8" är åtta timmar.
 *
 * Både punkt och komma godtas som decimaltecken — ett svenskt tangentbord ger
 * komma. Bara kolon skiljer timmar från minuter, så "7.30" är sju timmar och
 * arton minuter och inte sju och en halv.
 *
 * Tomt fält betyder ingen beräknad tid, vilket är något annat än noll timmar.
 */
export function parseHours(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const colon = text.match(/^(\d+):(\d{1,2})$/);

  if (colon) {
    const minutes = Number(colon[2]);
    if (minutes > 59) return null;

    const total = Number(colon[1]) * 60 + minutes;
    return total > 0 ? total : null;
  }

  const hours = Number(text.replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0) return null;

  return Math.round(hours * 60);
}

/**
 * Plockar ut raderna ur ett inskickat formulär.
 *
 * Fälten kommer som två parallella listor i samma ordning som raderna står på
 * skärmen, vilket är den ordning webbläsaren skickar dem i.
 *
 * Halvfyllda rader hoppas över i tysthet. Den som tryckt på plus och sedan
 * ångrat sig har lämnat en tom rad, inte begått ett fel — och att avvisa hela
 * sparandet för den raden hade kostat allt annat man skrivit.
 *
 * Samma moment två gånger läggs ihop till en rad. Skärmen erbjuder inte det
 * valet, men ett formulär kan skickas av annat än skärmen, och summan får
 * aldrig bero på vilken av två rader man råkar titta på.
 */
export function readBudgetRows(formData: FormData): BudgetRow[] {
  const momentIds = formData.getAll(BUDGET_MOMENT_FIELD);
  const hours = formData.getAll(BUDGET_HOURS_FIELD);

  const byMoment = new Map<string, number>();

  for (const [index, rawMomentId] of momentIds.entries()) {
    const momentId = String(rawMomentId ?? "").trim();
    const minutes = parseHours(hours[index] ?? null);

    if (!momentId || minutes === null) continue;

    byMoment.set(momentId, (byMoment.get(momentId) ?? 0) + minutes);
  }

  // Ordningen är kartans, alltså den ordning raderna stod i på skärmen. En Map
  // behåller insättningsordningen, och det är hela skälet att den används här
  // i stället för ett vanligt objekt.
  return [...byMoment].map(([momentId, minutes], sortOrder) => ({
    momentId,
    minutes,
    sortOrder,
  }));
}

/** Summan av raderna. Orderns beräknade tid, i minuter. */
export function budgetTotal(rows: { minutes: number }[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.minutes, 0);
}

/**
 * Skriver om orderns beräknade tid till exakt de rader som skickats in.
 *
 * Ersätter i stället för att lägga till: formuläret visar hela beräkningen, så
 * en rad som tagits bort på skärmen ska vara borta också i databasen.
 *
 * Både ordern och varje arbetsmoment slås upp genom den företagslåsta
 * klienten först. Id:na kommer från ett formulär, och ett id som pekar på en
 * annan kunds moment skulle annars bli en rad som bär vårt företag men visar
 * deras namn. Filtreringslagret stämplar företaget på raden men kan inte veta
 * vad de utpekade raderna tillhör — den kontrollen måste göras här.
 *
 * Görs i en transaktion. Raderna tas bort innan de nya skrivs, och ett avbrott
 * däremellan skulle annars lämna ordern helt utan beräkning.
 */
export async function saveOrderBudgets(
  db: CompanyDb,
  companyId: string,
  orderId: string,
  rows: BudgetRow[]
): Promise<void> {
  const order = await db.order.findFirst({
    where: { id: orderId },
    select: { id: true },
  });

  // Ingen order för det här företaget. Inget att skriva, och inget fel att
  // visa — anroparen har redan avfärdat id:t på samma sätt.
  if (!order) return;

  const known =
    rows.length === 0
      ? []
      : await db.workMoment.findMany({
          where: { id: { in: rows.map((row) => row.momentId) } },
          select: { id: true },
        });

  const knownIds = new Set(known.map((moment) => moment.id));
  const valid = rows.filter((row) => knownIds.has(row.momentId));

  await db.$transaction(async (tx) => {
    await tx.orderBudget.deleteMany({ where: { orderId } });

    if (valid.length === 0) return;

    await tx.orderBudget.createMany({
      data: valid.map((row, index) => ({
        companyId,
        orderId,
        momentId: row.momentId,
        minutes: row.minutes,
        // Numreras om efter filtreringen. Föll en rad bort för att momentet
        // hörde till ett annat företag skulle ordningen annars ha ett hål,
        // och nästa sparning hade flyttat raderna utan att någon bett om det.
        sortOrder: index,
      })),
    });
  });
}
