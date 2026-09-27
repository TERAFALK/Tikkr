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
 * Översikten och kundlistan var tidigare samma sida. Den gjorde sex saker och
 * var svår att använda till någon av dem.
 */

/**
 * Menyn i två grupper.
 *
 * Vänstergruppen är kundarbetet: hur det går, vilka kunderna är, vad de fått
 * veta. Högergruppen är driften av tjänsten själv. Skillnaden är vem man är
 * när man klickar, och en platt rad om sex likvärdiga länkar dolde den.
 */
interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/plattform", label: "Översikt", exact: true },
  { href: "/plattform/kunder", label: "Kunder" },
  { href: "/plattform/meddelanden", label: "Meddelanden" },
  { href: "/plattform/utskick", label: "Utskick" },
];

const OPERATIONS: NavItem[] = [
  { href: "/plattform/artiklar", label: "Artiklar" },
  { href: "/plattform/handelser", label: "Händelser" },
];

function isActive(item: NavItem, current: string): boolean {
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
              <NavLink key={item.href} item={item} current={current} />
            ))}
          </nav>

          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {OPERATIONS.map((item) => (
              <NavLink key={item.href} item={item} current={current} />
            ))}
            <span className="ml-2 border-l border-neutral-200 pl-3 text-[13px] text-neutral-400">
              {email}
            </span>
          </nav>

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
            ska gå att öppna från en telefon när något är trasigt. Länkarna
            rullar i sidled istället för att radbrytas — sex stycken på två
            rader knuffade ned sidans innehåll. */}
        <nav className="flex gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-2 sm:hidden">
          {[...NAV, ...OPERATIONS].map((item) => (
            <NavLink key={item.href} item={item} current={current} />
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

function NavLink({ item, current }: { item: NavItem; current: string }) {
  return (
    <Link
      href={item.href}
      className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
        isActive(item, current)
          ? "bg-neutral-100 text-neutral-900"
          : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
      }`}
    >
      {item.label}
    </Link>
  );
}
