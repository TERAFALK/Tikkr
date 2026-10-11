import { cookies } from "next/headers";
import { READ_ONLY_COOKIE, requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getOnboardingState } from "@/lib/onboarding";
import { evaluateAccess } from "@/lib/subscription";
import { isModuleKey, type ModuleKey } from "@/lib/modules";
import {
  getScreenPricing,
  paymentsAvailable,
  yearlyAvailable,
} from "@/lib/stripe";
import { activeNotices } from "@/lib/notices";
import { hasUnreadNews, runningVersion, visibleReleases } from "@/lib/news";
import AdminSidebar from "@/components/admin/AdminSidebar";
import NoticeBanner from "@/components/ui/NoticeBanner";
import SupportBanner from "@/components/admin/SupportBanner";
import ReadOnlyToast from "@/components/admin/ReadOnlyToast";
import ReloadOnDeploy from "@/components/ui/ReloadOnDeploy";
import SubscriptionLocked from "@/components/admin/SubscriptionLocked";
import Link from "next/link";
import { resendVerification } from "./konto/actions";

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

  // Flaggan som assertWritable() satte när en ändring nekades. Läses här och
  // slängs av komponenten i webbläsaren — en cookie går inte att ta bort
  // under en rendering.
  const deniedWrite = (await cookies()).get(READ_ONLY_COOKIE)?.value === "1";

  // Siffran i menyn ska säga hur mycket som är ogjort, inte hur många poster
  // av ett visst slag som är det. Snabbjobben räknas därför med: de ligger på
  // samma sida och är det av de två som hindrar en faktura helt.
  const [reviewEntries, quickJobs, onboarding, notices, company] =
    await Promise.all([
      session.db.timeEntry.count({ where: { needsReview: true } }),
      session.db.order.count({ where: { isQuickJob: true } }),
      getOnboardingState(session.db),
      activeNotices("admin"),
      unsafeGlobalPrisma.company.findUnique({
        where: { id: session.companyId },
        select: {
          subscriptionStatus: true,
          trialEndsAt: true,
          pastDueSince: true,
          logoSquareMimeType: true,
          screenLicenses: true,

          // Tillvalen hämtas i samma fråga som allt annat om företaget, i
          // stället för i en egen. Menyn behöver dem vid varje sidladdning.
          modules: { select: { module: true } },
        },
      }),
    ]);

  const reviewCount = reviewEntries + quickJobs;

  // Den inloggades egna uppgifter, för remsan och för pricken vid Nyheter.
  //
  // Inte i supportläget: där är ingen inloggad som kunden, och både remsan och
  // pricken gäller den som sitter vid skärmen.
  const me = session.support
    ? null
    : await session.db.adminUser.findFirst({
        where: { id: session.userId },
        select: { email: true, emailVerifiedAt: true, newsSeenVersion: true },
      });

  // OBEKRÄFTAD E-POSTADRESS. Remsan står tills länken använts, så att ett
  // stavfel vid registreringen syns första dagen och inte den dag lösenordet
  // glömts. Den spärrar ingenting. Se email-verification.ts.
  const unverifiedEmail = me && !me.emailVerifiedAt ? me.email : null;

  // Vilka menypunkter som ska synas. ATT DÖLJA DEM ÄR BARA KOSMETIK —
  // sidorna bakom vaktas var för sig av requireModule() och svarar 404
  // oavsett vad menyn visar. Samma hållning som prenumerationslåset nedan:
  // gömmer man bara menyn litar man på att ingen gissar adresser.
  const modules: ModuleKey[] = (company?.modules ?? [])
    .map((row) => row.module)
    .filter(isModuleKey);

  // Pricken vid Nyheter. Samma urval som sidan visar, så att en punkt om ett
  // tillval kunden inte har aldrig tänder den. Se news.ts.
  const version = runningVersion();
  const unreadNews =
    me !== null &&
    hasUnreadNews(visibleReleases(version, modules), me.newsSeenVersion);

  const access = evaluateAccess({
    status: company?.subscriptionStatus ?? "TRIALING",
    trialEndsAt: company?.trialEndsAt ?? null,
    pastDueSince: company?.pastDueSince ?? null,
  });

  return (
    <div className="min-h-screen bg-neutral-50 lg:flex">
      {/* Laddar om fliken efter en driftsättning. Utan den svarar knapparna i
          en sida som stått öppen "Failed to find Server Action". */}
      <ReloadOnDeploy />

      <AdminSidebar
        companyName={session.companyName}
        email={session.email}
        reviewCount={reviewCount}
        // Guiden ligger i menyn tills den är klar, och försvinner sedan. Den
        // nås därefter från Inställningar, under Om arbetsytan.
        showOnboarding={!onboarding.ready}
        hasLogo={Boolean(company?.logoSquareMimeType)}
        modules={modules}
        // Supportläget har inget eget konto: cookien bär plattformskontot,
        // inte ett av kundens. Se admin-session.ts.
        showAccount={!session.support}
        unreadNews={unreadNews}
        version={version}
      />

      <div className="min-w-0 flex-1">
        {/* Bannern ligger ÖVER prenumerationsvarningen och över allt innehåll.
            Vilket läge man är i avgör hur allt annat på sidan ska läsas. */}
        {session.support && <SupportBanner companyName={session.companyName} />}
        <ReadOnlyToast show={deniedWrite} />

        {unverifiedEmail && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-amber-900">
              <p>
                <strong>Bekräfta e-postadressen {unverifiedEmail}.</strong>{" "}
                Länken finns i mejlet från Tikkr.
              </p>
              <form action={resendVerification}>
                <button type="submit" className="font-medium underline">
                  Skicka igen
                </button>
              </form>
              <Link
                href="/admin/konto"
                className="font-medium underline"
              >
                Ändra adress
              </Link>
            </div>
          </div>
        )}

        {access.level === "warning" && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6 lg:px-8">
            <p className="mx-auto max-w-7xl text-[13px] text-amber-900">
              <strong>{access.headline}.</strong> {access.detail}
            </p>
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Driftmeddelanden ligger överst och över allt annat innehåll.
              Ett pågående avbrott förklarar varför sidan under beter sig
              konstigt, och den förklaringen kommer för sent längre ned. */}
          {notices.length > 0 && (
            <div className="mb-6">
              <NoticeBanner notices={notices} />
            </div>
          )}

          {/* Vid låst prenumeration visas ingen adminsida alls. Inget kan
              då råka nås via en direktlänk, vilket hade varit fallet om vi
              istället gömt menyn och litat på att ingen gissar adresser. */}
          {/* SUPPORTLÄGET SLÄPPS IGENOM PRENUMERATIONSLÅSET. En obetald faktura
              är oftast precis varför kunden ringer, och en supportvy som visar
              samma låsta sida som kunden ser hjälper ingen. Läget är läsning, så
              ingenting kan ändras medan låset är på. */}
          {access.level === "locked" && !session.support ? (
            <SubscriptionLocked
              state={access}
              companyName={session.companyName}
              screens={company?.screenLicenses ?? 1}
              paymentsAvailable={await paymentsAvailable()}
              yearlyAvailable={await yearlyAvailable()}
              pricing={await getScreenPricing()}
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
