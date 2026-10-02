"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogoMark, WordmarkOnly } from "@/components/ui/Logo";
import ReloadOnDeploy from "@/components/ui/ReloadOnDeploy";
import {
  IconBuilding,
  IconHistory,
  IconLogout,
  IconMail,
  IconMegaphone,
  IconOverview,
  IconTag,
} from "@/components/ui/icons";
import { platformLogout } from "@/app/plattform/login/actions";

/**
 * RAM RUNT PLATTFORMSPANELEN.
 *
 * SAMMA SKAL SOM KUNDENS PANEL, och det är en ändring från en topprad. Skälet
 * är inte smak: två olika skal i samma produkt lär ögat att det är två olika
 * produkter, och panelen är Tikkr sett från andra hållet — inte något annat.
 * Måtten här är AdminSidebars: 240 px, grupprubriker i versaler, grå platta
 * och grön ikon på aktiv länk.
 *
 * Det som skiljer är märkningen överst. Den räcker för att veta var man står,
 * och är ärligare än en avvikande färg — färgen sa "annan produkt" när
 * skillnaden i själva verket är "annan sorts konto".
 *
 * SIDORNA, OCH VAD VAR OCH EN SVARAR PÅ:
 *
 *   /plattform              Behöver något min uppmärksamhet i dag?
 *   /plattform/kunder       Vilka är kunderna, och var finns den jag söker?
 *   /plattform/kunder/[id]  Allt om ett företag
 *   /plattform/meddelanden  Vad ser kunderna för banner just nu?
 *   /plattform/utskick      Mejl till kundernas administratörer
 *   /plattform/artiklar     Vilka artiklar hos Stripe är vad?
 *   /plattform/handelser    Vad har gjorts härifrån?
 *
 * Grupperna speglar vem man är när man klickar: kundarbete respektive drift av
 * tjänsten själv. Samma ord som kundpanelen använder — "Dagligen" är det man
 * öppnar varje morgon.
 */

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Markera bara vid exakt träff — annars matchar "/plattform" allt. */
  exact?: boolean;
}

const SECTIONS: { label: string; links: NavLink[] }[] = [
  {
    label: "Dagligen",
    links: [
      {
        href: "/plattform",
        label: "Översikt",
        icon: IconOverview,
        exact: true,
      },
      { href: "/plattform/kunder", label: "Kunder", icon: IconBuilding },
      {
        href: "/plattform/meddelanden",
        label: "Meddelanden",
        icon: IconMegaphone,
      },
      { href: "/plattform/utskick", label: "Utskick", icon: IconMail },
    ],
  },
  {
    label: "Drift",
    links: [
      { href: "/plattform/artiklar", label: "Artiklar", icon: IconTag },
      { href: "/plattform/handelser", label: "Händelser", icon: IconHistory },
    ],
  },
];

export default function PlatformShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const nav = <Nav email={email} onNavigate={() => setOpen(false)} />;

  return (
    <div className="min-h-screen bg-neutral-50 lg:flex">
      {/* Laddar om fliken efter en driftsättning, så att knapparna inte
          plötsligt svarar "Failed to find Server Action". */}
      <ReloadOnDeploy />

      {/* Liten skärm: menyn fälls ut i flödet istället för att äta halva
          bredden. Samma lösning som kundpanelen. */}
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 lg:hidden">
        <button
          onClick={() => setOpen((value) => !value)}
          className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100"
          aria-label="Visa meny"
          aria-expanded={open}
        >
          <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <WordmarkOnly height={11} />
        <span className="ml-auto rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
          Plattform
        </span>
      </div>

      {open && (
        <div className="border-b border-neutral-200 bg-white lg:hidden">
          {nav}
        </div>
      )}

      <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen">
        {nav}
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Nav({
  email,
  onNavigate,
}: {
  email: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-6 p-3">
      {/* Märkningen sitter där kundens panel har företagsnamnet. Det är samma
          plats i blicken, och svarar på samma fråga: vems yta är det här? */}
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <LogoMark size={32} />
        <span className="min-w-0">
          <span className="block leading-tight">
            <WordmarkOnly height={10} />
          </span>
          <span className="mt-0.5 block text-[11px] leading-tight text-neutral-400">
            Plattform
          </span>
        </span>
      </div>

      <div className="flex-1 space-y-6">
        {SECTIONS.map((section) => (
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
                      onClick={onNavigate}
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-neutral-200 pt-3">
        <form action={platformLogout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          >
            <IconLogout className="text-neutral-400" />
            Logga ut
          </button>
        </form>

        <p className="truncate px-2 pt-2 text-[11px] text-neutral-400">
          {email}
        </p>
      </div>
    </nav>
  );
}
