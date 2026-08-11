"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/admin/actions";
import {
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
} from "@/components/ui/icons";

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
}

const sections: { label: string; links: NavLink[] }[] = [
  {
    label: "Dagligen",
    links: [
      { href: "/admin", label: "Översikt", icon: IconOverview, exact: true },
      { href: "/admin/rapporter", label: "Rapporter", icon: IconReport },
      { href: "/admin/granskning", label: "Granskning", icon: IconReview, badge: true },
      { href: "/admin/stamplingar", label: "Stämplingar", icon: IconClock },
    ],
  },
  {
    label: "Register",
    links: [
      { href: "/admin/ordrar", label: "Ordrar", icon: IconOrder },
      { href: "/admin/anstallda", label: "Anställda", icon: IconPeople },
      { href: "/admin/moment", label: "Arbetsmoment", icon: IconMoment },
      { href: "/admin/skarmar", label: "Skärmar", icon: IconDevice },
    ],
  },
];

export default function AdminSidebar({
  companyName,
  email,
  reviewCount,
  showOnboarding,
}: {
  companyName: string;
  email: string;
  reviewCount: number;
  showOnboarding: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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

  const visibleSections = showOnboarding
    ? [setupSection, ...sections]
    : sections;

  const nav = (
    <nav className="flex h-full flex-col gap-6 p-3">
      <CompanyBadge companyName={companyName} />

      <div className="flex-1 space-y-6">
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
                        className={active ? "text-blue-600" : "text-neutral-400"}
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

      <div className="space-y-0.5 border-t border-neutral-200 pt-3">
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
                ? "text-blue-600"
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

        <p className="truncate px-2 pt-2 text-[11px] text-neutral-400">{email}</p>
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
        <span className="text-sm font-semibold">Tikkr</span>
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

function CompanyBadge({ companyName }: { companyName: string }) {
  // Initialen fungerar som igenkänningstecken när man växlar mellan flera
  // kunder — samma idé som en arbetsyteväljare i andra verktyg.
  const initial = companyName.trim().charAt(0).toUpperCase() || "T";

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">
        {initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight text-neutral-900">
          {companyName}
        </span>
        <span className="block text-[11px] leading-tight text-neutral-400">
          Tikkr
        </span>
      </span>
    </div>
  );
}
