import Link from "next/link";
import type { ReactNode } from "react";
import { platformLogout } from "@/app/plattform/login/actions";

/**
 * RAM RUNT PLATTFORMSPANELEN.
 *
 * Mörk topprad, till skillnad från kundernas ljusa panel. Det är den enda
 * platsen i produkten där någon ser alla kunder samtidigt, och den ska inte
 * gå att förväxla med en vanlig arbetsyta — samma skäl som
 * plattformsinloggningen har egen bakgrund.
 *
 * Navigeringen ligger här och inte per sida, så att en ny vy inte kan glömmas
 * bort i menyn.
 */

const NAV = [
  { href: "/plattform", label: "Kunder", exact: true },
  { href: "/plattform/meddelanden", label: "Meddelanden" },
];

export default function PlatformShell({
  email,
  current,
  children,
}: {
  email: string;
  /** Vilken flik som är aktiv. Adressen till sidan. */
  current: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-neutral-900">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[13px] font-semibold text-neutral-900">
            T
          </span>
          <span className="text-[13px] font-semibold text-white">
            Tikkr · Plattform
          </span>

          <nav className="ml-4 hidden gap-1 sm:flex">
            {NAV.map((item) => {
              const active = item.exact
                ? current === item.href
                : current.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-neutral-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <span className="ml-auto hidden text-[13px] text-neutral-500 sm:block">
            {email}
          </span>

          <form action={platformLogout}>
            <button
              type="submit"
              className="text-[13px] font-medium text-neutral-300 hover:text-white"
            >
              Logga ut
            </button>
          </form>
        </div>

        {/* Menyn på små skärmar. Panelen används mest från en dator, men den
            ska gå att öppna från en telefon när något är trasigt. */}
        <nav className="flex gap-1 border-t border-white/10 px-4 py-2 sm:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${
                (item.exact ? current === item.href : current.startsWith(item.href))
                  ? "bg-white/10 text-white"
                  : "text-neutral-400"
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
