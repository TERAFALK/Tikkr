"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleKey } from "@/lib/modules";
import {
  IconBuilding,
  IconCalendar,
  IconClock,
  IconHistory,
  IconPeople,
  IconShield,
  IconTag,
  IconTimeline,
} from "@/components/ui/icons";

/**
 * Undernavigeringen för inställningarna.
 *
 * En enda lång inställningssida gör att man måste läsa allt för att hitta det
 * man söker. Uppdelat efter vad man faktiskt kom hit för att göra.
 *
 * GRUPPERAD I TRE AVSNITT, av samma skäl som vänstermenyn är det: åtta
 * likvärdiga länkar i rad tvingar ögat att läsa alla varje gång. Avsnitten
 * svarar på tre olika frågor — hur arbetsytan är satt upp, hur tiden räknas
 * till lön, och vem som kommer in och vad som hänt.
 *
 * Löneunderlagets två sidor ligger i ett EGET avsnitt och inte utspridda
 * bland de andra. Hela avsnittet faller bort med tillvalet, och det som står
 * kvar är då inte en lista med hål i.
 *
 * Det egna kontot ligger INTE här. Namn, telefonnummer och lösenord är den
 * inloggades egna uppgifter och inte inställningar för arbetsytan, se
 * /admin/konto och AdminSidebar.
 */

interface SettingsPage {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  exact?: boolean;
}

interface SettingsSection {
  label: string;
  pages: SettingsPage[];
  /** Tillvalet avsnittet hör till. Utelämnad betyder basen. Se AdminSidebar. */
  module?: ModuleKey;
}

const sections: SettingsSection[] = [
  {
    label: "Arbetsytan",
    pages: [
      {
        href: "/admin/installningar",
        label: "Företag",
        description: "Namn, märke och påslag",
        icon: IconBuilding,
        exact: true,
      },
      {
        href: "/admin/installningar/tider",
        label: "Tid och automatik",
        description: "Tidszon och utstämpling",
        icon: IconClock,
      },
      {
        href: "/admin/installningar/prenumeration",
        label: "Prenumeration",
        description: "Betalning och skärmar",
        icon: IconTag,
      },
    ],
  },
  {
    label: "Löneunderlag",
    module: "PAYROLL",
    pages: [
      {
        href: "/admin/installningar/schema",
        label: "Arbetstider",
        description: "Schema och raster",
        icon: IconTimeline,
      },
      {
        href: "/admin/installningar/franvaro",
        label: "Frånvaroorsaker",
        description: "Sjuk, semester, komp",
        icon: IconCalendar,
      },
    ],
  },
  {
    label: "Åtkomst och spår",
    pages: [
      {
        href: "/admin/installningar/anvandare",
        label: "Användare",
        description: "Konton med åtkomst",
        icon: IconPeople,
      },
      {
        href: "/admin/installningar/logg",
        label: "Ändringslogg",
        description: "Vem ändrade vad",
        icon: IconHistory,
      },
      {
        href: "/admin/installningar/dataskydd",
        label: "Dataskydd",
        description: "GDPR och personuppgifter",
        icon: IconShield,
      },
    ],
  },
];

export default function SettingsNav({ modules }: { modules: ModuleKey[] }) {
  const pathname = usePathname();

  const visible = sections.filter(
    (section) => !section.module || modules.includes(section.module)
  );

  return (
    <nav className="mb-6 lg:mb-0 lg:w-56 lg:shrink-0">
      {/* Liten skärm: en rad att dra i sidled, utan avsnittsrubriker. En
          rubrik mitt i en vågrät rad bryter bara upp den. */}
      <div className="flex gap-1 overflow-x-auto lg:hidden">
        {visible
          .flatMap((section) => section.pages)
          .map((page) => (
            <NavItem
              key={page.href}
              page={page}
              active={isActive(page, pathname)}
              compact
            />
          ))}
      </div>

      <div className="hidden space-y-5 lg:block">
        {visible.map((section) => (
          <div key={section.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.pages.map((page) => (
                <li key={page.href}>
                  <NavItem page={page} active={isActive(page, pathname)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function isActive(page: SettingsPage, pathname: string) {
  return page.exact ? pathname === page.href : pathname.startsWith(page.href);
}

function NavItem({
  page,
  active,
  compact,
}: {
  page: SettingsPage;
  active: boolean;
  compact?: boolean;
}) {
  const Icon = page.icon;

  return (
    <Link
      href={page.href}
      className={`flex shrink-0 items-start gap-2.5 rounded-md px-3 py-2 transition-colors ${
        active
          ? "bg-white text-neutral-900 ring-1 ring-neutral-200"
          : "text-neutral-600 hover:bg-white/70"
      }`}
    >
      <Icon
        className={`mt-0.5 shrink-0 ${active ? "text-tick-deep" : "text-neutral-400"}`}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{page.label}</span>
        {!compact && (
          <span className="block text-xs text-neutral-400">
            {page.description}
          </span>
        )}
      </span>
    </Link>
  );
}
