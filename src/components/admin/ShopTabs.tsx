"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Flikarna i butiken: produkterna och företagets beställningar.
 *
 * Kassan hör till Produkter, eftersom man kommer dit från dem.
 */
const TABS = [
  { href: "/admin/butik", label: "Produkter" },
  { href: "/admin/butik/bestallningar", label: "Beställningar" },
];

export default function ShopTabs() {
  const pathname = usePathname();
  const onOrders = pathname.startsWith("/admin/butik/bestallningar");

  return (
    <nav aria-label="Butiken" className="mb-6 flex gap-1 border-b border-neutral-200">
      {TABS.map((tab) => {
        const active = tab.href === "/admin/butik" ? !onOrders : onOrders;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "border-fjord text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
