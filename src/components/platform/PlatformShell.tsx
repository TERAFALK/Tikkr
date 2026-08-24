import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/Logo";
import ReloadOnDeploy from "@/components/ui/ReloadOnDeploy";
import { platformLogout } from "@/app/plattform/login/actions";

/**
 * RAM RUNT PLATTFORMSPANELEN.
 *
 * Samma formspråk som kundernas panel: ljus bakgrund, vit topprad, tunn linje
 * under. Panelen är en del av samma produkt och ska se ut så.
 *
 * Det som skiljer är en märkning i toppraden. Den räcker för att veta var man
 * står, och är ärligare än en avvikande färg — färgen sa "annan produkt" när
 * skillnaden i själva verket är "annan sorts konto".
 *
 * Navigeringen ligger här och inte per sida, så att en ny vy inte kan glömmas
 * bort i menyn.
 */

const NAV = [
  { href: "/plattform", label: "Kunder", exact: true },
  { href: "/plattform/meddelanden", label: "Meddelanden" },
  { href: "/plattform/utskick", label: "Utskick" },
  { href: "/plattform/handelser", label: "Händelser" },
];

function isActive(item: (typeof NAV)[number], current: string): boolean {
  return item.exact ? current === item.href : current.startsWith(item.href);
}

export default function PlatformShell({
  email,
  current,
  children,
}: {
  email: string;
  /** Adressen till sidan som visas, för att märka rätt flik. */
  current: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Laddar om fliken efter en driftsättning, så att knapparna inte
          plötsligt svarar "Failed to find Server Action". */}
      <ReloadOnDeploy />

      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/plattform" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-[13px] font-semibold text-neutral-900">
              Tikkr
            </span>
          </Link>

          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Plattform
          </span>

          <nav className="ml-3 hidden gap-1 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  isActive(item, current)
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <span className="ml-auto hidden text-[13px] text-neutral-400 sm:block">
            {email}
          </span>

          <form action={platformLogout}>
            <button
              type="submit"
              className="text-[13px] font-medium text-neutral-500 hover:text-neutral-900"
            >
              Logga ut
            </button>
          </form>
        </div>

        {/* Menyn på små skärmar. Panelen används mest från en dator, men den
            ska gå att öppna från en telefon när något är trasigt. */}
        <nav className="flex gap-1 border-t border-neutral-100 px-4 py-2 sm:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${
                isActive(item, current)
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-500"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
