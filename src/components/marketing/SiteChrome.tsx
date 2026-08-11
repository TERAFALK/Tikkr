import Link from "next/link";
import { Wordmark } from "@/components/ui/Logo";

/**
 * Toppmeny och sidfot för säljsidan.
 *
 * Menyn följer med när man skrollar. På en sida där beslutet fattas långt ner
 * ska knappen som leder vidare aldrig vara utanför skärmen.
 */

const NAV = [
  { href: "#sa-funkar-det", label: "Så funkar det" },
  { href: "#funktioner", label: "Funktioner" },
  { href: "#pris", label: "Pris" },
  { href: "#fragor", label: "Frågor" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5">
        <Link href="/" aria-label="Tikkr, till startsidan">
          <Wordmark size={30} />
        </Link>

        <nav className="hidden gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/admin/login"
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            Logga in
          </Link>
          <Link
            href="/registrera"
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700"
          >
            Kom igång
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-xs">
            <Wordmark size={30} />
            <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
              Tidregistrering per order och arbetsmoment, byggd för svensk
              verkstads- och tillverkningsindustri.
            </p>
          </div>

          <div className="flex gap-12">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Produkt
              </p>
              <ul className="mt-3 space-y-2 text-[13px]">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="text-neutral-600 hover:text-neutral-900"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Konto
              </p>
              <ul className="mt-3 space-y-2 text-[13px]">
                <li>
                  <Link href="/registrera" className="text-neutral-600 hover:text-neutral-900">
                    Skapa arbetsyta
                  </Link>
                </li>
                <li>
                  <Link href="/admin/login" className="text-neutral-600 hover:text-neutral-900">
                    Logga in
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-10 border-t border-neutral-200 pt-6 text-xs text-neutral-400">
          © {new Date().getFullYear()} Tikkr. Priser exklusive moms.
        </p>
      </div>
    </footer>
  );
}
