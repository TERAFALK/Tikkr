import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getOnboardingState } from "@/lib/onboarding";
import { evaluateAccess } from "@/lib/subscription";
import { isStripeConfigured, yearlyAvailable } from "@/lib/stripe";
import AdminSidebar from "@/components/admin/AdminSidebar";
import SubscriptionLocked from "@/components/admin/SubscriptionLocked";

/**
 * Skalet runt de inloggade adminsidorna.
 *
 * Två kontroller ligger här, alltså på ETT ställe, och ärvs av varje undersida:
 * att man är inloggad, och att prenumerationen är i ordning.
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

  const [reviewCount, onboarding, company] = await Promise.all([
    session.db.timeEntry.count({ where: { needsReview: true } }),
    getOnboardingState(session.db),
    unsafeGlobalPrisma.company.findUnique({
      where: { id: session.companyId },
      select: {
        subscriptionStatus: true,
        trialEndsAt: true,
        pastDueSince: true,
        logoSquareMimeType: true,
        screenLicenses: true,
      },
    }),
  ]);

  const access = evaluateAccess({
    status: company?.subscriptionStatus ?? "TRIALING",
    trialEndsAt: company?.trialEndsAt ?? null,
    pastDueSince: company?.pastDueSince ?? null,
  });

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
        hasLogo={Boolean(company?.logoSquareMimeType)}
      />

      <div className="min-w-0 flex-1">
        {access.level === "warning" && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6 lg:px-8">
            <p className="mx-auto max-w-7xl text-[13px] text-amber-900">
              <strong>{access.headline}.</strong> {access.detail}
            </p>
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Vid låst prenumeration visas ingen adminsida alls. Inget kan
              då råka nås via en direktlänk, vilket hade varit fallet om vi
              istället gömt menyn och litat på att ingen gissar adresser. */}
          {access.level === "locked" ? (
            <SubscriptionLocked
              state={access}
              companyName={session.companyName}
              screens={company?.screenLicenses ?? 1}
              stripeConfigured={isStripeConfigured()}
              yearlyAvailable={yearlyAvailable()}
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
