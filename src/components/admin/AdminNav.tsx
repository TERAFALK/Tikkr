"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/admin/actions";

// Navigeringen. Ordnad efter hur ofta man faktiskt använder sakerna: rapporter
// och granskning dagligen, inställningar sällan.

// Rapporter och Inställningar byggs i nästa omgång och saknas därför här —
// hellre en kortare meny än länkar som leder till ingenting.
const links = [
  { href: "/admin", label: "Översikt", exact: true },
  { href: "/admin/granskning", label: "Granskning" },
  { href: "/admin/ordrar", label: "Ordrar" },
  { href: "/admin/anstallda", label: "Anställda" },
  { href: "/admin/moment", label: "Arbetsmoment" },
  { href: "/admin/skarmar", label: "Skärmar" },
];

export default function AdminNav({
  companyName,
  email,
}: {
  companyName: string;
  email: string;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/admin" className="text-lg font-semibold tracking-tight">
          Tikkr
        </Link>

        <span className="hidden text-sm text-slate-400 sm:inline">/</span>
        <span className="text-sm font-medium text-slate-600">{companyName}</span>

        <nav className="order-last flex w-full flex-wrap gap-1 lg:order-none lg:w-auto">
          {links.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          {/* Utloggning som formulär mot en serveråtgärd. Då behövs ingen
              sessionshantering i webbläsaren alls. */}
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Logga ut
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
