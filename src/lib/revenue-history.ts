import { unsafeGlobalPrisma } from "./db";
import { monthlyRevenueFor } from "./platform-admin";
import { getScreenPricing } from "./stripe";

/**
 * INTÄKTENS UTVECKLING ÖVER TID.
 *
 * Panelen visar nuläget. Nuläget säger ingenting om riktningen, och riktningen
 * är det enda som betyder något: 8 000 kr i månadsintäkt är en bra siffra om
 * den var 6 000 förra månaden och en dålig om den var 12 000.
 *
 * Historiken går inte att räkna fram i efterhand. En avslutad prenumeration
 * lämnar inga spår om vad den var värd, och en kund som halverat antalet
 * licenser ser i dag ut att alltid ha haft det lägre antalet. Därför skrivs en
 * rad per dag av schemajobbet, och grafen börjar den dag jobbet först kördes.
 */

/** Skriver dagens läge. Anropas av schemajobbet och är ofarlig att köra ofta. */
export async function recordSnapshot(now: Date = new Date()): Promise<void> {
  const day = startOfDay(now);

  const [companies, pricing] = await Promise.all([
    unsafeGlobalPrisma.company.findMany({
      select: {
        subscriptionStatus: true,
        subscriptionInterval: true,
        screenLicenses: true,
      },
    }),
    getScreenPricing(),
  ]);

  const paying = companies.filter(
    (company) => company.subscriptionStatus === "ACTIVE"
  );

  const mrr = paying.reduce(
    (sum, company) => sum + monthlyRevenueFor(company, pricing),
    0
  );

  const data = {
    mrr,
    payingCompanies: paying.length,
    trialingCompanies: companies.filter(
      (company) => company.subscriptionStatus === "TRIALING"
    ).length,
    licensesSold: paying.reduce(
      (sum, company) => sum + company.screenLicenses,
      0
    ),
  };

  // Skriver över dagens rad. Jobbet kör var femtonde minut, och den sista
  // körningen på dygnet är den som gäller.
  await unsafeGlobalPrisma.revenueSnapshot.upsert({
    where: { day },
    update: data,
    create: { day, ...data },
  });
}

export interface MonthPoint {
  /** Månaden i formatet "aug", för etiketten under stapeln. */
  label: string;
  /** Hela månaden, för läsare som behöver det exakta. */
  month: string;
  mrr: number;
  payingCompanies: number;
}

/**
 * Månadsintäkten månad för månad, senaste tolv månaderna.
 *
 * Tar den SISTA mätpunkten i varje månad. Genomsnittet vore missvisande — en
 * kund som tillkom den 28:e skulle dra ned månaden trots att intäkten steg.
 */
export async function monthlyRevenueHistory(): Promise<MonthPoint[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - 12);

  const rows = await unsafeGlobalPrisma.revenueSnapshot.findMany({
    where: { day: { gte: startOfDay(from) } },
    orderBy: { day: "asc" },
  });

  const byMonth = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    // Senare rad ersätter tidigare i samma månad, eftersom listan är sorterad.
    byMonth.set(monthKey(row.day), row);
  }

  return [...byMonth.entries()].map(([month, row]) => ({
    month,
    label: MONTHS[Number(month.slice(5, 7)) - 1],
    mrr: row.mrr,
    payingCompanies: row.payingCompanies,
  }));
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
