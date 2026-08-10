import { redirect } from "next/navigation";
import { auth } from "./auth";
import { forCompany, type CompanyDb } from "./tenant";

/**
 * Grinden till adminpanelen.
 *
 * Varje adminsida och varje serveråtgärd ska börja med `requireAdmin()`. Den
 * gör två saker i ett svep: kastar ut den som inte är inloggad, och lämnar
 * tillbaka en databasklient som är låst till just den personens företag.
 *
 * Poängen är att det ska vara enklare att göra rätt än fel. Den som skriver en
 * ny adminsida får företagsfiltreringen på köpet — det finns ingen genväg
 * förbi som råkar bli den bekväma vägen.
 */

export interface AdminSession {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: string;
  /** Databasklient låst till användarens företag. */
  db: CompanyDb;
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await auth();

  if (!session?.user?.companyId) {
    redirect("/admin/login");
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    role: session.user.role,
    db: forCompany(session.user.companyId),
  };
}
