"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/admin/actions";
import {
  IconBroom,
  IconBuilding,
  IconClock,
  IconDevice,
  IconLogout,
  IconMoment,
  IconOrder,
  IconOverview,
  IconPeople,
  IconReport,
  IconReview,
  IconSettings,
  IconSparkle,
  IconStation,
  IconTimeline,
  IconUser,
} from "@/components/ui/icons";
import type { ModuleKey } from "@/lib/modules";
import CompanyBadge from "@/components/ui/CompanyBadge";
import { LogoMark, WordmarkOnly } from "@/components/ui/Logo";

/**
 * Vänsternavigeringen.
 *
 * Grupperad i två sektioner, eftersom det speglar hur arbetet faktiskt ser ut:
 * "Dagligen" är det man öppnar varje morgon, "Register" är sådant man ändrar
 * någon gång i månaden. En platt lista med åtta likvärdiga länkar tvingar
 * ögat att läsa alla varje gång.
 *
 * Antalet ogranskade poster visas som siffra direkt i menyn — det är det enda
 * i systemet som kräver att någon gör något, och då ska det synas utan att man
 * först klickar sig in någonstans.
 */

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Markera bara som aktiv vid exakt träff — annars matchar "/admin" allt. */
  exact?: boolean;
  /** Visa antalet ogranskade poster som siffra. */
  badge?: boolean;
  /**
   * Tillvalet länken hör till. Utelämnad betyder basen, alltså alltid synlig.
   *
   * Att dölja menypunkten är BARA kosmetik — sidan bakom den vaktas av
   * requireModule() och svarar 404 oavsett vad menyn visar. Se
   * src/lib/company-modules.ts.
   */
  module?: ModuleKey;
}

const sections: { label: string; links: NavLink[] }[] = [
  {
    label: "Dagligen",
    links: [
      { href: "/admin", label: "Översikt", icon: IconOverview, exact: true },
      { href: "/admin/rapporter", label: "Rapporter", icon: IconReport },
      { href: "/admin/vecka", label: "Veckovy", icon: IconClock },
      {
        href: "/admin/tidrapport",
        label: "Tidrapport",
        icon: IconPeople,
        module: "PAYROLL",
      },
      {
        href: "/admin/planering",
        label: "Planering",
        icon: IconTimeline,
        // Tavlan ligger under Dagligen och inte under Register: den öppnas
        // varje morgon, inte någon gång i månaden. Stationerna, som är ett
        // register, ligger längre ner.
        //
        // `exact` eftersom stationssidan ligger under samma adress och har en
        // egen menypunkt. Utan den skulle båda markeras som aktiva samtidigt.
        exact: true,
        module: "PLANNING",
      },
      { href: "/admin/granskning", label: "Granskning", icon: IconReview, badge: true },
      { href: "/admin/stamplingar", label: "Stämplingar", icon: IconClock },
    ],
  },
  {
    label: "Register",
    links: [
      { href: "/admin/kunder", label: "Kunder", icon: IconBuilding },
      { href: "/admin/ordrar", label: "Ordrar", icon: IconOrder },
      { href: "/admin/anstallda", label: "Anställda", icon: IconPeople },
      { href: "/admin/moment", label: "Arbetsmoment", icon: IconMoment },
      {
        href: "/admin/improduktivt",
        label: "Improduktiv tid",
        icon: IconBroom,
      },
      {
        href: "/admin/planering/stationer",
        label: "Stationer",
        icon: IconStation,
        module: "PLANNING",
      },
      {
        href: "/admin/skarmar",
        label: "Stämplingsskärmar",
        icon: IconDevice,
      },
    ],
  },
];

export default function AdminSidebar({
  companyName,
  email,
  reviewCount,
  showOnboarding,
  hasLogo,
  modules,
  showAccount,
  unreadNews,
  version,
}: {
  companyName: string;
  email: string;
  reviewCount: number;
  /** Visar avsnittet "Uppsättning" med Kom igång. Döljs när guiden är klar. */
  showOnboarding: boolean;
  hasLogo: boolean;
  /** Företagets påslagna tillval. Länkar till avstängda moduler utelämnas. */
  modules: ModuleKey[];
  /** Falskt i supportläget, där ingen är inloggad som kunden. */
  showAccount: boolean;
  /** Pricken vid Nyheter: en nyare version än den personen sett. */
  unreadNews: boolean;
  /** Versionen som kör, från bygget. */
  version: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // PRICKEN SLÄCKS NÄR SIDAN ÖPPNAS, även här. Layouten renderas inte om när
  // man går mellan sidorna i panelen, så värdet den skickade står kvar tills
  // nästa omladdning. Utan det här tändes pricken igen så fort man lämnade
  // sidan som just markerat allt som läst.
  const onNews = pathname.startsWith("/admin/nyheter");
  const [newsOpened, setNewsOpened] = useState(false);
  useEffect(() => {
    if (onNews) setNewsOpened(true);
  }, [onNews]);
  const showNewsDot = unreadNews && !newsOpened && !onNews;

  // Typen skrivs ut, annars slår TypeScript ihop avsnitten till en union där
  // fält som bara finns på vissa länkar (badge, exact) försvinner.
  const setupSection: { label: string; links: NavLink[] } = {
    label: "Uppsättning",
    links: [
      {
        href: "/admin/kom-igang",
        label: "Kom igång",
        icon: IconOverview,
        exact: true,
      },
    ],
  };

  // Guiden ligger överst medan uppsättningen pågår och försvinner när den är
  // klar. En permanent menypunkt är skräp för den som redan kommit igång, och
  // kunden bad uttryckligen om att slippa den: sidan nås från Inställningar,
  // under Om arbetsytan.
  //
  // Att den dök upp igen när alla ordrar levererats var ett annat fel, och det
  // sitter inte här. Se lib/onboarding.ts: stegen räknar allt som finns, inte
  // bara det som är öppet just nu.
  const allSections = showOnboarding ? [setupSection, ...sections] : sections;

  // Avsnitt som blir tomma faller bort med sin rubrik. En rubrik utan länkar
  // under sig ser ut som ett fel.
  const visibleSections = allSections
    .map((section) => ({
      ...section,
      links: section.links.filter(
        (link) => !link.module || modules.includes(link.module)
      ),
    }))
    .filter((section) => section.links.length > 0);

  const nav = (
    <nav className="flex h-full flex-col gap-6 p-3">
      <div className="shrink-0">
        <CompanyHeader companyName={companyName} hasLogo={hasLogo} />
      </div>

      {/* BARA LÄNKARNA RULLAR. Inställningar, Logga ut, adressen och
          Tikkr-märket står still längst ner.

          Menypunkterna blev fler än skärmen är hög, och eftersom hela
          navigeringen växte trycktes botten utanför rutan: märket syntes inte
          alls, och Logga ut låg utom räckhåll på en kort skärm.

          `min-h-0` måste stå med. En flexrad vägrar annars bli mindre än sitt
          innehåll, och då rullar ingenting — rutan växer i stället, vilket är
          precis vad den gjorde. */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.links.map((link) => {
                const active = link.exact
                  ? pathname === link.href
                  : pathname.startsWith(link.href);
                const Icon = link.icon;

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                        active
                          ? "bg-neutral-100 text-neutral-900"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                      }`}
                    >
                      <Icon
                        className={active ? "text-tick-deep" : "text-neutral-400"}
                      />
                      <span className="flex-1 truncate">{link.label}</span>

                      {link.badge && reviewCount > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700">
                          {reviewCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 space-y-0.5 border-t border-neutral-200 pt-3">
        {/* NYHETERNA ligger här nere och inte bland arbetet. De handlar om
            Tikkr, inte om verkstaden, och öppnas en gång per version. */}
        <Link
          href="/admin/nyheter"
          onClick={() => setOpen(false)}
          className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
            onNews
              ? "bg-neutral-100 text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          }`}
        >
          <IconSparkle className={onNews ? "text-tick-deep" : "text-neutral-400"} />
          <span className="flex-1">Nyheter</span>
          {showNewsDot && (
            <span className="size-2 rounded-full bg-tick-deep">
              <span className="sr-only">Nya</span>
            </span>
          )}
        </Link>

        {/* DET EGNA KONTOT ligger här och inte under Inställningar. Namn,
            telefonnummer och lösenord är den inloggades egna uppgifter, inte
            inställningar för arbetsytan, och de låg länge på sidan som
            handlar om vilka ANDRA som har åtkomst. Adressen stod redan här
            som en rad text; nu är den vägen in. */}
        {showAccount && (
          <Link
            href="/admin/konto"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${
              pathname.startsWith("/admin/konto")
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
            }`}
          >
            <IconUser
              className={
                pathname.startsWith("/admin/konto")
                  ? "shrink-0 text-tick-deep"
                  : "shrink-0 text-neutral-400"
              }
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight">
                Ditt konto
              </span>
              <span className="block truncate text-[11px] leading-tight text-neutral-400">
                {email}
              </span>
            </span>
          </Link>
        )}

        <Link
          href="/admin/installningar"
          onClick={() => setOpen(false)}
          className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
            pathname.startsWith("/admin/installningar")
              ? "bg-neutral-100 text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          }`}
        >
          <IconSettings
            className={
              pathname.startsWith("/admin/installningar")
                ? "text-tick-deep"
                : "text-neutral-400"
            }
          />
          Inställningar
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          >
            <IconLogout className="text-neutral-400" />
            Logga ut
          </button>
        </form>

        {/* Tikkr-märket nedtonat. Panelen tillhör kunden — deras logotyp står
            överst, vår står i marginalen. */}
        <div className="flex items-center gap-2 px-2 pt-2.5 text-neutral-400">
          <LogoMark size={22} />
          <WordmarkOnly height={10} tone="current" />
          <span className="ml-auto truncate text-[11px] tabular-nums">
            {version}
          </span>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Liten skärm: menyn fälls ut istället för att äta halva bredden. */}
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 lg:hidden">
        <button
          onClick={() => setOpen((value) => !value)}
          className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100"
          aria-label="Visa meny"
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <WordmarkOnly height={11} />
        {reviewCount > 0 && (
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
            {reviewCount} att granska
          </span>
        )}
      </div>

      {open && (
        <div className="border-b border-neutral-200 bg-white lg:hidden">{nav}</div>
      )}

      <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen">
        {nav}
      </aside>
    </>
  );
}

function CompanyHeader({
  companyName,
  hasLogo,
}: {
  companyName: string;
  hasLogo: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <CompanyBadge companyName={companyName} hasLogo={hasLogo} size={32} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight text-neutral-900">
          {companyName}
        </span>
        <span className="block text-[11px] leading-tight text-neutral-400">
          Arbetsyta
        </span>
      </span>
    </div>
  );
}
