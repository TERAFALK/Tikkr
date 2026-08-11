import { redirect } from "next/navigation";
import { auth } from "./auth";
import { unsafeGlobalPrisma } from "./db";

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

export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.trim().toLowerCase());
}

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
