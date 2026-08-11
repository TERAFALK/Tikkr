import { requireAdmin } from "@/lib/admin-session";
import { getOnboardingState } from "@/lib/onboarding";
import { isPlatformAdmin } from "@/lib/platform-admin";
import AdminSidebar from "@/components/admin/AdminSidebar";

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

  // Hämtas här så att siffran i menyn stämmer på varje sida, inte bara på den
  // som råkar visa granskningslistan.
  const [reviewCount, onboarding] = await Promise.all([
    session.db.timeEntry.count({ where: { needsReview: true } }),
    getOnboardingState(session.db),
  ]);

  return (
    <div className="min-h-screen bg-neutral-50 lg:flex">
      <AdminSidebar
        companyName={session.companyName}
        email={session.email}
        reviewCount={reviewCount}
        // Guiden ligger i menyn tills den är klar, och försvinner sedan.
        // En permanent "kom igång"-länk är bara skräp för den som redan kommit
        // igång; sidan finns kvar på sin adress för den som vill tillbaka.
        showOnboarding={!onboarding.ready}
        isPlatformAdmin={isPlatformAdmin(session.email)}
      />

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
