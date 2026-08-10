import { requireAdmin } from "@/lib/admin-session";
import AdminNav from "@/components/admin/AdminNav";

/**
 * Skalet runt de inloggade adminsidorna.
 *
 * Kontrollen ligger här, alltså på ETT ställe — varje undersida ärver den och
 * kan inte råka glömmas bort.
 *
 * Mappnamnet inom parentes bildar ingen del av adressen. Det finns bara för att
 * kunna lägga inloggningssidan UTANFÖR det här skalet: låg den innanför skulle
 * den kräva inloggning för att visa inloggningen, och sidan skulle skicka
 * användaren till sig själv i en evig rundgång.
 */

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav companyName={session.companyName} email={session.email} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
