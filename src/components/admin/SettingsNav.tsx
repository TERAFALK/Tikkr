"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBuilding,
  IconClock,
  IconPeople,
  IconShield,
} from "@/components/ui/icons";

/**
 * Undernavigering för inställningarna.
 *
 * En enda lång inställningssida gör att man måste läsa allt för att hitta det
 * man söker, och gör det svårt att lägga till nytt utan att sidan växer sig
 * ohanterlig. Uppdelat efter vad man faktiskt kom hit för att göra.
 */

interface SettingsPage {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  exact?: boolean;
}

const pages: SettingsPage[] = [
  {
    href: "/admin/installningar",
    label: "Företag",
    description: "Namn och uppgifter",
    icon: IconBuilding,
    exact: true,
  },
  {
    href: "/admin/installningar/tider",
    label: "Tid och automatik",
    description: "Klockslag och tidszon",
    icon: IconClock,
  },
  {
    href: "/admin/installningar/anvandare",
    label: "Användare",
    description: "Vilka som kan logga in",
    icon: IconPeople,
  },
  {
    href: "/admin/installningar/dataskydd",
    label: "Dataskydd",
    description: "GDPR och personuppgifter",
    icon: IconShield,
  },
];

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 lg:mb-0 lg:w-56 lg:shrink-0">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {pages.map((page) => {
          const active = page.exact
            ? pathname === page.href
            : pathname.startsWith(page.href);
          const Icon = page.icon;

          return (
            <li key={page.href} className="shrink-0 lg:shrink">
              <Link
                href={page.href}
                className={`flex items-start gap-2.5 rounded-md px-3 py-2 transition-colors ${
                  active
                    ? "bg-white text-neutral-900 ring-1 ring-neutral-200"
                    : "text-neutral-600 hover:bg-white/70"
                }`}
              >
                <Icon
                  className={`mt-0.5 ${active ? "text-blue-600" : "text-neutral-400"}`}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">
                    {page.label}
                  </span>
                  <span className="hidden text-xs text-neutral-400 lg:block">
                    {page.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
