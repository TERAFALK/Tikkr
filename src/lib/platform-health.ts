import { unsafeGlobalPrisma } from "./db";
import { monthlyRevenueFor } from "./platform-admin";
import { getScreenPricing } from "./stripe";

/**
 * DET SOM BEHÖVER ÅTGÄRDAS.
 *
 * Tre listor och en driftöversikt. Alla svarar på samma fråga: vad behöver jag
 * göra i dag som jag annars får veta av en irriterad kund om två veckor.
 *
 * Listorna visas bara när de har innehåll. En panel full av tomma rutor lär
 * ögat att hoppa över dem, och då syns inte den dagen något faktiskt står där.
 *
 * Går avsiktligt utanför företagsfiltreringen, men hämtar bara DRIFTUPPGIFTER
 * — namn på skärmar och tidpunkter, aldrig namn på anställda eller vad de
 * arbetat med. Samma gräns som resten av panelen.
 */

/** En skärm räknas som tyst efter så här länge utan kontakt. */
export const SILENT_DEVICE_HOURS = 24;

/** Provperioder som går ut inom så här många dagar visas. */
export const TRIAL_WARNING_DAYS = 7;

/** En betalande kund utan aktivitet så här länge är på väg bort. */
export const QUIET_CUSTOMER_DAYS = 14;

export interface SilentDevice {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  lastSeenAt: Date | null;
  /** Timmar sedan senaste kontakt. null när skärmen aldrig kopplats. */
  silentHours: number | null;
}

/**
 * Skärmar som slutat höra av sig.
 *
 * Det överlägset vanligaste supportärendet. Med den här listan hinner du ringa
 * kunden innan kunden ringer dig — och en skärm som varit tyst en vecka har
 * ofta stått oanvänd lika länge, vilket är en förlorad faktura för dem.
 *
 * Skärmar som aldrig kopplats tas inte med. De är inte trasiga, bara oanvända,
 * och de skulle ligga kvar i listan för alltid.
 */
export async function silentDevices(): Promise<SilentDevice[]> {
  const cutoff = new Date(Date.now() - SILENT_DEVICE_HOURS * 60 * 60 * 1000);

  const rows = await unsafeGlobalPrisma.kioskDevice.findMany({
    where: {
      // Bara kopplade skärmar. En som väntar på sin kod har aldrig hört av
      // sig och ska inte ligga i listan över tysta.
      tokenHash: { not: null },
      lastSeenAt: { not: null, lt: cutoff },
    },
    orderBy: { lastSeenAt: "asc" },
    take: 25,
    select: {
      id: true,
      name: true,
      lastSeenAt: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    companyId: row.companyId,
    companyName: row.company.name,
    lastSeenAt: row.lastSeenAt,
    silentHours: row.lastSeenAt
      ? Math.floor((Date.now() - row.lastSeenAt.getTime()) / (60 * 60 * 1000))
      : null,
  }));
}

export interface EndingTrial {
  companyId: string;
  companyName: string;
  trialEndsAt: Date;
  daysLeft: number;
  /** Antal stämplingar under provperioden. Säger om de kommit igång. */
  entries: number;
  devices: number;
}

/**
 * Provperioder som snart går ut.
 *
 * De sista dagarna avgör om kunden blir kund. Antalet stämplingar står med
 * eftersom det skiljer de två samtal som behövs: den som kommit igång ska
 * påminnas om att välja abonnemang, den som inte gjort något ska frågas vad
 * som gick fel.
 */
export async function endingTrials(): Promise<EndingTrial[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + TRIAL_WARNING_DAYS);

  const companies = await unsafeGlobalPrisma.company.findMany({
    where: {
      subscriptionStatus: "TRIALING",
      trialEndsAt: { not: null, lte: cutoff },
    },
    orderBy: { trialEndsAt: "asc" },
    select: {
      id: true,
      name: true,
      trialEndsAt: true,
      _count: { select: { kioskDevices: true } },
    },
  });

  if (companies.length === 0) return [];

  const counts = await unsafeGlobalPrisma.timeEntry.groupBy({
    by: ["companyId"],
    where: { companyId: { in: companies.map((company) => company.id) } },
    _count: { _all: true },
  });

  const byCompany = new Map(
    counts.map((row) => [row.companyId, row._count._all])
  );

  return companies.map((company) => ({
    companyId: company.id,
    companyName: company.name,
    trialEndsAt: company.trialEndsAt!,
    daysLeft: Math.ceil(
      (company.trialEndsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    ),
    entries: byCompany.get(company.id) ?? 0,
    devices: company._count.kioskDevices,
  }));
}

export interface QuietCustomer {
  companyId: string;
  companyName: string;
  lastActivityAt: Date | null;
  quietDays: number | null;
  monthlyRevenue: number;
}

/**
 * Betalande kunder som slutat registrera tid.
 *
 * Det tidigaste tecknet på en uppsägning, långt före att någon säger upp. En
 * kund som betalar men inte använder tjänsten kommer förr eller senare att
 * upptäcka det på fakturan.
 */
export async function quietCustomers(): Promise<QuietCustomer[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - QUIET_CUSTOMER_DAYS);

  const [companies, latest, pricing] = await Promise.all([
    unsafeGlobalPrisma.company.findMany({
      where: { subscriptionStatus: "ACTIVE" },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        subscriptionInterval: true,
        screenLicenses: true,
      },
    }),
    unsafeGlobalPrisma.timeEntry.groupBy({
      by: ["companyId"],
      _max: { clockInAt: true },
    }),
    getScreenPricing(),
  ]);

  const lastByCompany = new Map(
    latest.map((row) => [row.companyId, row._max.clockInAt])
  );

  return companies
    .map((company) => {
      const lastActivityAt = lastByCompany.get(company.id) ?? null;

      return {
        companyId: company.id,
        companyName: company.name,
        lastActivityAt,
        quietDays: lastActivityAt
          ? Math.floor(
              (Date.now() - lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
            )
          : null,
        monthlyRevenue: monthlyRevenueFor(company, pricing),
      };
    })
    .filter(
      (company) => !company.lastActivityAt || company.lastActivityAt < cutoff
    )
    .sort((a, b) => (b.quietDays ?? 9999) - (a.quietDays ?? 9999));
}

export interface SystemHealth {
  /** Databasens storlek i klartext, exempelvis "42 MB". */
  databaseSize: string | null;
  /** När schemajobbet senast rapporterade in. */
  lastCronRun: Date | null;
  /** Antal stämplingar som ligger öppna just nu, över alla kunder. */
  openEntries: number;
  /** Antal poster som väntar på granskning, över alla kunder. */
  needsReview: number;
}

/**
 * Driftläget.
 *
 * Siffrorna som säger om något är på väg att gå fel innan det gör det. Ett
 * schemajobb som slutat köra märks annars först när en kund undrar varför
 * gårdagens glömda utstämpling ligger kvar öppen.
 */
export async function systemHealth(): Promise<SystemHealth> {
  const [size, cron, openEntries, needsReview] = await Promise.all([
    databaseSize(),
    unsafeGlobalPrisma.platformState.findUnique({
      where: { key: LAST_CRON_KEY },
    }),
    unsafeGlobalPrisma.timeEntry.count({ where: { clockOutAt: null } }),
    unsafeGlobalPrisma.timeEntry.count({ where: { needsReview: true } }),
  ]);

  return {
    databaseSize: size,
    lastCronRun: cron ? new Date(cron.value) : null,
    openEntries,
    needsReview,
  };
}

/** Nyckeln som schemajobbet skriver sin senaste körning på. */
export const LAST_CRON_KEY = "last-cron-run";

/** Anropas av schemajobbet, så att en utebliven körning går att se. */
export async function noteCronRun(at: Date = new Date()): Promise<void> {
  await unsafeGlobalPrisma.platformState.upsert({
    where: { key: LAST_CRON_KEY },
    update: { value: at.toISOString() },
    create: { key: LAST_CRON_KEY, value: at.toISOString() },
  });
}

/**
 * Databasens storlek.
 *
 * Rå SQL, eftersom det inte är en fråga om data utan om databasen själv. Går
 * via den ofiltrerade klienten av samma skäl. Fel här får inte fälla sidan —
 * en saknad siffra är bättre än en panel som inte går att öppna.
 */
async function databaseSize(): Promise<string | null> {
  try {
    const rows = await unsafeGlobalPrisma.$queryRaw<{ size: string }[]>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size
    `;

    return rows[0]?.size ?? null;
  } catch (error) {
    console.error("Kunde inte läsa databasens storlek", error);
    return null;
  }
}
