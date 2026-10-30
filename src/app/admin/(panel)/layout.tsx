import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  isOwner,
  READ_ONLY_COOKIE,
  requireAdminEvenIfLocked,
} from "@/lib/admin-session";
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
 * Layouten ritar menyn, remsorna och låsskärmen. SKYDDET LIGGER INTE HÄR, utan
 * i requireAdmin(), som varje sida och åtgärd kallar själv. Next kör sidan även
 * när layouten inte ritar `children`, se admin-session.ts.
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
  const session = await requireAdminEvenIfLocked();

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
  // stavfel syns första dagen och inte den dag lösenordet glömts. Den spärrar
  // ingenting. Se email-verification.ts.
  const unverifiedEmail = me && !me.emailVerifiedAt ? me.email : null;

  /**
   * DEN NYREGISTRERADE KOMMER INTE IN FÖRRÄN ADRESSEN ÄR BEKRÄFTAD
   * (2026-10-11).
   *
   * Gäller bara den första sessionen, den som släpptes in utan uppsatt app
   * (`mfaPending`, se admin-session.ts). För alla andra står remsan kvar som
   * förut och spärrar ingenting: de har tvåsteg, och en adress som blivit
   * obekräftad för att någon rättat den ska inte låsa ute en arbetsyta mitt i
   * en arbetsdag.
   *
   * Spärren är ett FLÖDESSTEG och inte en säkerhetsgräns: arbetsytan är
   * personens egen, och det som skyddas är att vi kan nå hen. Därför räcker
   * den här kontrollen, till skillnad från modulgrinden i § 3.1, som måste
   * ligga i varje rutt.
   */
  if (session.mfaPending && unverifiedEmail) redirect("/admin/bekrafta-adressen");

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

      <a
        href="#innehall"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-fjord focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
      >
        Hoppa till innehållet
      </a>

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
      />

      <div className="min-w-0 flex-1">
        {/* Bannern ligger ÖVER prenumerationsvarningen och över allt innehåll.
            Vilket läge man är i avgör hur allt annat på sidan ska läsas. */}
        {session.support && <SupportBanner companyName={session.companyName} />}
        <ReadOnlyToast show={deniedWrite} />

        {/* TVÅSTEGSVERIFIERINGEN ÄR INTE UPPSATT (2026-10-11).
            
            Står bara för den som släppts in utan app, alltså den som nyss
            registrerat. Den spärrar ingenting här — nästa inloggning gör det,
            eftersom inloggningssidan möter ett konto utan app med QR-koden.
            Remsan säger det rakt ut, så att det inte kommer som en
            överraskning nästa morgon.
            
            Knappen leder till Ditt konto med rutan redan öppen. Rutan finns
            byggd på ett ställe, se konto/page.tsx. */}
        {session.mfaPending && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-amber-900">
              <p>
                <strong>Tvåstegsverifieringen är inte uppsatt.</strong> Nästa
                gång du loggar in behöver du en kod från en app i telefonen.
              </p>
              <Link href="/admin/konto?tvasteg=1" className="font-medium underline">
                Koppla app
              </Link>
            </div>
          </div>
        )}

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

        <main
          id="innehall"
          tabIndex={-1}
          className="mx-auto max-w-7xl px-4 py-6 focus:outline-hidden sm:px-6 lg:px-8 lg:py-8"
        >
          {/* Driftmeddelanden ligger överst och över allt annat innehåll.
              Ett pågående avbrott förklarar varför sidan under beter sig
              konstigt, och den förklaringen kommer för sent längre ned. */}
          {notices.length > 0 && (
            <div className="mb-6">
              <NoticeBanner notices={notices} />
            </div>
          )}

          {/* Låsskärmen. Att sidan inte når hit är requireAdmin()s verk, se
              toppen av filen. Grenen visar bara vad en låst arbetsyta ska se.

              SUPPORTLÄGET ÄR ALDRIG LÅST. En obetald faktura är oftast precis
              varför kunden ringer, och en supportvy som visar samma låsta sida
              som kunden ser hjälper ingen. Läget är läsning, så ingenting kan
              ändras. */}
          {session.locked ? (
            <SubscriptionLocked
              state={access}
              companyName={session.companyName}
              screens={company?.screenLicenses ?? 1}
              paymentsAvailable={await paymentsAvailable()}
              yearlyAvailable={await yearlyAvailable()}
              pricing={await getScreenPricing()}
              canBuy={isOwner(session)}
            />
          ) : (
            // Ramen som sidbytet tonas in i, se `.panel-content` i
            // globals.css. Den står kvar; det som byts är innehållet.
            <div className="panel-content">{children}</div>
          )}
        </main>
      </div>
    </div>
  );
}
