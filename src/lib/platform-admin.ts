import { redirect } from "next/navigation";
import { auth } from "./auth";
import { unsafeGlobalPrisma } from "./db";
import { isPlatformAdmin } from "./platform-access";

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

/** Grinden till plattformspanelen. */
export async function requirePlatformAdmin() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/admin/login");
  }

  if (!isPlatformAdmin(session.user.email)) {
    // Samma svar som för en adress som inte finns — vi bekräftar inte ens att
    // panelen existerar för den som inte ska se den.
    redirect("/admin");
  }

  return { email: session.user.email };
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

  const companies = await unsafeGlobalPrisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
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
  }));
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
    select: { subscriptionStatus: true, name: true },
  });

  if (!before) return;
  if (before.subscriptionStatus === params.status) return;

  await unsafeGlobalPrisma.company.update({
    where: { id: params.companyId },
    data: { subscriptionStatus: params.status },
  });

  await record({
    actorEmail: params.actorEmail,
    action: "Ändrade prenumeration",
    targetCompanyId: params.companyId,
    detail: `${before.subscriptionStatus} → ${params.status}. ${params.reason}`.trim(),
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
