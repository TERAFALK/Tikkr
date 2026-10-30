import { redirect } from "next/navigation";
import { requireAdminEvenIfLocked } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * Hit skickar requireAdmin() en låst arbetsyta.
 *
 * Tom med flit: låsskärmen ritas av panelens layout. Sidan finns för att det
 * ska finnas en adress utan data att stå på. Är låset hävt, till exempel efter
 * en betalning, leder den tillbaka till översikten.
 */
export default async function LockedPage() {
  const session = await requireAdminEvenIfLocked();

  if (!session.locked) redirect("/admin");

  return null;
}
