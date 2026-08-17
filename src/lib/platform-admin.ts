import { redirect } from "next/navigation";
import { unsafeGlobalPrisma } from "./db";
import { isPlatformAdmin } from "./platform-access";
import { readPlatformSession } from "./platform-session";
import { getScreenPricing, type ScreenPricing } from "./stripe";
import { TRIAL_LICENSES } from "./licenses";

/**
 * PLATTFORMSADMINISTRATION.
 *
 * Din egen översikt över alla kundföretag. Skiljer sig från allt annat i
 * Tikkr genom att den medvetet går utanför företagsfiltreringen — och därför
 * är den byggd med två begränsningar som inte ska tas bort:
 *
 * 1. Behörigheten styrs av en miljövariabel på servern, inte av ett fält i
 *    databasen. Ingen kan ge sig själv den inifrån appen, ens med ett kapat
 *    ägarkonto. Den ändras bara av den som kommer åt servern.
 *
 * 2. Bara SIFFROR om kunderna hämtas — antal anställda, antal stämplingar,
 *    senaste aktivitet. Aldrig innehållet: inga namn på anställda, inga
 *    ordernummer, inga tider. Det du behöver för att sköta en tjänst är att
 *    veta att en kund är aktiv, inte vad de arbetar med.
 *
 * Kunddata är kundens. Att kunna läsa den vore ett löfte vi bryter mot varje
 * kund som frågar vem som ser deras siffror.
 */

// Själva behörighetsregeln ligger i platform-access.ts, fri från webbramverk
// så att den går att testa utan att starta en app.
export { isPlatformAdmin, platformAdminEmails } from "./platform-access";

/**
 * Grinden till plattformspanelen.
 *
 * Kontrollerar BÅDA villkoren vid varje sidladdning, inte bara vid inloggning.
 * Tas en adress bort ur PLATFORM_ADMIN_EMAILS ska den som redan är inloggad
 * kastas ut vid nästa klick — annars vore en återkallad behörighet giltig i
 * åtta timmar till.
 */
export async function requirePlatformAdmin() {
  const email = await readPlatformSession();

  if (!email || !isPlatformAdmin(email)) {
    redirect("/plattform/login");
  }

  return { email };
}

export interface CompanyOverview {
  id: string;
  name: string;
  subscriptionStatus: string;
  createdAt: Date;
  admins: number;
  employees: number;
  devices: number;
  openOrders: number;
  entriesLast30Days: number;
  lastActivityAt: Date | null;
  /** Antal licenser företaget betalar för. */
  licenses: number;
  /** Månadsintäkt i kronor. Årsbetalningar räknas om till per månad. */
  monthlyRevenue: number;
  /** true när Stripe styr prenumerationen. */
  managedByStripe: boolean;
}

/**
 * Månadsintäkt för ett företag, oavsett betalningsintervall.
 *
 * Priset skickas in istället för att läsas här, så att samma siffra används i
 * hela vyn även om artikeln hos betaltjänsten ändras mitt under en sidladdning.
 */
export function monthlyRevenueFor(
  company: {
    subscriptionStatus: string;
    screenLicenses: number;
    subscriptionInterval: string | null;
  },
  pricing: ScreenPricing
): number {
  if (company.subscriptionStatus !== "ACTIVE") return 0;

  const perScreen =
    company.subscriptionInterval === "year" && pricing.year !== null
      ? pricing.year / 12
      : pricing.month;

  return Math.round(company.screenLicenses * perScreen);
}

/**
 * Siffror per kundföretag.
 *
 * Går avsiktligt via den ofiltrerade klienten — det är hela poängen med vyn.
 * Notera att inga fält med innehåll hämtas.
 */
export async function listCompanies(): Promise<CompanyOverview[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const pricing = await getScreenPricing();

  const companies = await unsafeGlobalPrisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      subscriptionInterval: true,
      screenLicenses: true,
      stripeSubscriptionId: true,
      createdAt: true,
      _count: {
        select: {
          adminUsers: true,
          employees: true,
          kioskDevices: true,
        },
      },
    },
  });

  // Aggregat per företag i två frågor istället för två per företag. Med
  // hundra kunder är skillnaden hundratals databasanrop per sidladdning.
  const [recent, latest, openOrders] = await Promise.all([
    unsafeGlobalPrisma.timeEntry.groupBy({
      by: ["companyId"],
      where: { clockInAt: { gte: since } },
      _count: { _all: true },
    }),
    unsafeGlobalPrisma.timeEntry.groupBy({
      by: ["companyId"],
      _max: { clockInAt: true },
    }),
    unsafeGlobalPrisma.order.groupBy({
      by: ["companyId"],
      where: { status: "OPEN" },
      _count: { _all: true },
    }),
  ]);

  const recentByCompany = new Map(
    recent.map((row) => [row.companyId, row._count._all])
  );
  const latestByCompany = new Map(
    latest.map((row) => [row.companyId, row._max.clockInAt])
  );
  const ordersByCompany = new Map(
    openOrders.map((row) => [row.companyId, row._count._all])
  );

  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    subscriptionStatus: company.subscriptionStatus,
    createdAt: company.createdAt,
    admins: company._count.adminUsers,
    employees: company._count.employees,
    devices: company._count.kioskDevices,
    openOrders: ordersByCompany.get(company.id) ?? 0,
    entriesLast30Days: recentByCompany.get(company.id) ?? 0,
    lastActivityAt: latestByCompany.get(company.id) ?? null,
    licenses: company.screenLicenses,
    monthlyRevenue: monthlyRevenueFor(company, pricing),
    managedByStripe: Boolean(company.stripeSubscriptionId),
  }));
}

export interface RevenueSummary {
  /** Återkommande månadsintäkt. */
  mrr: number;
  /** Årsvärde av nuvarande månadsintäkt. */
  arr: number;
  payingCompanies: number;
  trialingCompanies: number;
  pastDueCompanies: number;
  licensesSold: number;
  /** Genomsnittlig månadsintäkt per betalande företag. */
  averagePerCompany: number;
}

export function summarizeRevenue(companies: CompanyOverview[]): RevenueSummary {
  const paying = companies.filter(
    (company) => company.subscriptionStatus === "ACTIVE"
  );

  const mrr = paying.reduce((sum, company) => sum + company.monthlyRevenue, 0);

  return {
    mrr,
    arr: mrr * 12,
    payingCompanies: paying.length,
    trialingCompanies: companies.filter(
      (company) => company.subscriptionStatus === "TRIALING"
    ).length,
    pastDueCompanies: companies.filter(
      (company) => company.subscriptionStatus === "PAST_DUE"
    ).length,
    licensesSold: paying.reduce((sum, company) => sum + company.licenses, 0),
    averagePerCompany: paying.length > 0 ? Math.round(mrr / paying.length) : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Ett enskilt företag                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Detaljer för supportärenden.
 *
 * Gränsen som gäller här: DRIFTUPPGIFTER är åtkomliga, VERKSAMHETSINNEHÅLL är
 * det inte.
 *
 * Åtkomligt: vilka som kan logga in, vad skärmarna heter, när de senast hördes
 * av, hur mycket som registrerats. Det är precis vad ett supportsamtal handlar
 * om — "vår skärm i monteringen slutade fungera".
 *
 * Inte åtkomligt: namn på anställda, ordernummer, kundnamn, registrerade
 * tider. Det är kundens affär och angår inte den som driver servern.
 */
export async function getCompanyDetail(companyId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      subscriptionInterval: true,
      screenLicenses: true,
      stripeSubscriptionId: true,
      autoCloseAt: true,
      timezone: true,
      createdAt: true,
    },
  });

  if (!company) return null;

  const [admins, devices, note, counts, recentEntries, lastEntry, history] =
    await Promise.all([
      unsafeGlobalPrisma.adminUser.findMany({
        where: { companyId },
        orderBy: [{ role: "asc" }, { email: "asc" }],
        select: { id: true, email: true, role: true, createdAt: true },
      }),
      unsafeGlobalPrisma.kioskDevice.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, active: true, lastSeenAt: true },
      }),
      unsafeGlobalPrisma.platformNote.findUnique({
        where: { targetCompanyId: companyId },
      }),
      Promise.all([
        unsafeGlobalPrisma.employee.count({ where: { companyId, active: true } }),
        unsafeGlobalPrisma.order.count({ where: { companyId, status: "OPEN" } }),
        unsafeGlobalPrisma.workMoment.count({ where: { companyId, active: true } }),
        unsafeGlobalPrisma.timeEntry.count({ where: { companyId } }),
        unsafeGlobalPrisma.timeEntry.count({
          where: { companyId, needsReview: true },
        }),
        unsafeGlobalPrisma.timeEntry.count({
          where: { companyId, clockOutAt: null },
        }),
      ]),
      unsafeGlobalPrisma.timeEntry.count({
        where: { companyId, clockInAt: { gte: since } },
      }),
      unsafeGlobalPrisma.timeEntry.findFirst({
        where: { companyId },
        orderBy: { clockInAt: "desc" },
        select: { clockInAt: true },
      }),
      unsafeGlobalPrisma.platformAuditLog.findMany({
        where: { targetCompanyId: companyId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const [employees, openOrders, moments, totalEntries, needsReview, openNow] =
    counts;

  return {
    company,
    admins,
    devices,
    note,
    history,
    stats: {
      employees,
      openOrders,
      moments,
      totalEntries,
      needsReview,
      openNow,
      entriesLast30Days: recentEntries,
      lastActivityAt: lastEntry?.clockInAt ?? null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Åtgärder — allt här loggas                                                  */
/* -------------------------------------------------------------------------- */

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

export class PlatformActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformActionError";
  }
}

async function record(params: {
  actorEmail: string;
  action: string;
  targetCompanyId?: string;
  detail?: string;
}) {
  await unsafeGlobalPrisma.platformAuditLog.create({
    data: {
      actorEmail: params.actorEmail,
      action: params.action,
      targetCompanyId: params.targetCompanyId ?? null,
      detail: params.detail ?? null,
    },
  });
}

/**
 * Sätter antalet licenser för hand.
 *
 * Behövs för fakturakunder. Utan den kan en kund som betalar mot faktura sättas
 * till aktiv men aldrig få fler än provperiodens två skärmar, vilket gör
 * fakturakunder oanvändbara i praktiken.
 *
 * Spärras för företag som betalar via Stripe, av samma skäl som statusen:
 * antalet styrs av prenumerationen där och skulle skrivas över vid nästa
 * besked. Kunden ändrar det själv i sin panel.
 */
export async function setLicensesManually(params: {
  actorEmail: string;
  companyId: string;
  licenses: number;
  reason: string;
}) {
  if (!Number.isInteger(params.licenses) || params.licenses < 1) {
    throw new PlatformActionError("Antalet måste vara minst en licens.");
  }

  if (params.licenses > 100) {
    throw new PlatformActionError("Fler än hundra licenser hanteras manuellt.");
  }

  const before = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { screenLicenses: true, stripeSubscriptionId: true },
  });

  if (!before) return;

  if (before.stripeSubscriptionId) {
    throw new PlatformActionError(
      "Antalet styrs av prenumerationen hos Stripe. Kunden ändrar det själv " +
        "under Inställningar → Prenumeration."
    );
  }

  if (before.screenLicenses === params.licenses) return;

  await unsafeGlobalPrisma.company.update({
    where: { id: params.companyId },
    data: { screenLicenses: params.licenses },
  });

  await record({
    actorEmail: params.actorEmail,
    action: "Ändrade antal licenser",
    targetCompanyId: params.companyId,
    detail:
      `${before.screenLicenses} → ${params.licenses}. ${params.reason}`.trim(),
  });
}

/**
 * Sätter prenumerationsstatus för hand.
 *
 * Behövs tills Stripe är kopplat, och även efteråt: en kund som betalar mot
 * faktura eller får en förlängd provperiod ska gå att hantera utan att någon
 * pillar i databasen. Ändringen loggas med vem som gjorde den och varför.
 */
export async function setSubscriptionStatus(params: {
  actorEmail: string;
  companyId: string;
  status: SubscriptionStatus;
  reason: string;
}) {
  const before = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: {
      subscriptionStatus: true,
      name: true,
      stripeSubscriptionId: true,
      screenLicenses: true,
    },
  });

  if (!before) return;
  if (before.subscriptionStatus === params.status) return;

  // Företag med en prenumeration hos Stripe styrs därifrån. En manuell
  // ändring här skulle skrivas över vid nästa besked från Stripe, och under
  // tiden visa ett läge som inte stämmer med vad kunden faktiskt betalar.
  // Ändringar för sådana företag görs i Stripe.
  if (before.stripeSubscriptionId) {
    throw new PlatformActionError(
      "Företaget har en aktiv prenumeration hos Stripe. Ändra den i Stripe — " +
        "en ändring här skulle skrivas över vid nästa uppdatering."
    );
  }

  // Tillbaka till provperiod betyder tillbaka till provperiodens villkor.
  // Utan den här raden behöll ett företag som köpt tre licenser dem gratis
  // efter att prenumerationen avslutats — de betalade för noll och kunde köra
  // tre skärmar.
  const backToTrial = params.status === "TRIALING";

  await unsafeGlobalPrisma.company.update({
    where: { id: params.companyId },
    data: {
      subscriptionStatus: params.status,
      ...(backToTrial && { screenLicenses: TRIAL_LICENSES }),
    },
  });

  await record({
    actorEmail: params.actorEmail,
    action: "Ändrade prenumeration",
    targetCompanyId: params.companyId,
    detail:
      `${before.subscriptionStatus} → ${params.status}. ${params.reason}`.trim() +
      (backToTrial && before.screenLicenses !== TRIAL_LICENSES
        ? ` Licenser återställda från ${before.screenLicenses} till ${TRIAL_LICENSES}.`
        : ""),
  });
}

export async function saveNote(params: {
  actorEmail: string;
  companyId: string;
  body: string;
}) {
  const body = params.body.trim();

  if (!body) {
    await unsafeGlobalPrisma.platformNote.deleteMany({
      where: { targetCompanyId: params.companyId },
    });
  } else {
    await unsafeGlobalPrisma.platformNote.upsert({
      where: { targetCompanyId: params.companyId },
      update: { body, updatedByEmail: params.actorEmail },
      create: {
        targetCompanyId: params.companyId,
        body,
        updatedByEmail: params.actorEmail,
      },
    });
  }

  await record({
    actorEmail: params.actorEmail,
    action: body ? "Uppdaterade anteckning" : "Tog bort anteckning",
    targetCompanyId: params.companyId,
  });
}

/** Senaste händelserna över alla företag. */
export async function recentPlatformActivity(limit = 30) {
  return unsafeGlobalPrisma.platformAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
