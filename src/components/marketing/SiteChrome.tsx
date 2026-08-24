import Link from "next/link";
import { Wordmark } from "@/components/ui/Logo";
import { activeNotices } from "@/lib/notices";

/**
 * Toppmeny och sidfot för säljsidan.
 *
 * Menyn följer med när man skrollar. På en sida där beslutet fattas långt ner
 * ska knappen som leder vidare aldrig vara utanför skärmen.
 */

/**
 * De rättsliga sidorna.
 *
 * Länkas i foten på varje sida. Adresserna anges också i betaltjänstens
 * kundportal, som kräver att villkor och integritetspolicy går att nå.
 */
export const LEGAL = [
  { href: "/villkor", label: "Användarvillkor" },
  { href: "/integritetspolicy", label: "Integritetspolicy" },
  { href: "/personuppgiftsbitradesavtal", label: "Biträdesavtal" },
];

/**
 * Adresserna inleds med snedstreck.
 *
 * Ett ensamt "#pris" betyder "avsnittet pris på DEN HÄR sidan". Står man på
 * villkorssidan finns inget sådant avsnitt, och länken leder till
 * /villkor#pris där ingenting händer. Med "/#pris" går den alltid till
 * startsidan först.
 */
const NAV = [
  { href: "/#sa-funkar-det", label: "Så fungerar det" },
  { href: "/#funktioner", label: "Funktioner" },
  { href: "/#underlag", label: "Underlag" },
  { href: "/#pris", label: "Pris" },
  { href: "/#fragor", label: "Frågor" },
];

/**
 * Hämtar meddelandena, eller inga alls.
 *
 * Säljsidan förrenderas när containern byggs, och då finns ingen databas — den
 * startar först efteråt. Utan det här skyddet stoppar en frånvarande databas
 * hela bygget, vilket den inte ska: en säljsida som beskriver en produkt
 * behöver inte produktens databas för att gå att läsa.
 *
 * Samma sak gäller i drift. Skulle databasen ligga nere är en säljsida utan
 * driftmeddelande bättre än ingen säljsida alls.
 *
 * Panelen och kiosken har medvetet INTE det här skyddet. Där ska ett
 * databasfel synas, eftersom sidorna ändå inte fungerar utan den.
 */
async function noticesOrNone() {
  try {
    return await activeNotices("site");
  } catch (error) {
    console.error("Kunde inte hämta driftmeddelanden till säljsidan", error);
    return [];
  }
}

/**
 * Driftmeddelande på säljsidan.
 *
 * En smal remsa ovanför menyn, i löptextens storlek och utan färgblock. Den
 * ska synas av den som läser, inte skrika åt den som skummar.
 *
 * Ligger ovanför den fastnitade menyn med flit och följer alltså inte med när
 * man skrollar. Ett driftmeddelande är relevant vid ankomsten, inte hela vägen
 * ned genom prislistan.
 *
 * Bara meddelanden som uttryckligen märkts för säljsidan visas. Det är den
 * enda ytan som når någon som ännu inte är kund.
 */
async function SiteNotices() {
  const notices = await noticesOrNone();
  if (notices.length === 0) return null;

  return (
    <div className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-2.5">
        {notices.map((notice) => (
          <p
            key={notice.id}
            className="flex items-start gap-2 text-[13px] leading-relaxed text-neutral-600"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                notice.kind === "INCIDENT" ? "bg-amber-500" : "bg-neutral-400"
              }`}
            />
            <span>
              <span className="font-medium text-neutral-900">
                {notice.title}.
              </span>{" "}
              {notice.body}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function SiteHeader() {
  return (
    <>
      <SiteNotices />
      <SiteHeaderBar />
    </>
  );
}

function SiteHeaderBar() {
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
              Tidregistrering per order och arbetsmoment för svensk verkstadsindustri.
            </p>
            <p className="mt-3 text-[13px] text-neutral-500">
              En del av{" "}
              <span className="font-medium text-neutral-700">TERAFALK AB</span>
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

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Villkor
              </p>
              <ul className="mt-3 space-y-2 text-[13px]">
                {LEGAL.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-neutral-600 hover:text-neutral-900"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Kontakt
              </p>
              <ul className="mt-3 space-y-2 text-[13px]">
                <li>
                  <a
                    href="mailto:support@tikkr.se"
                    className="text-neutral-600 hover:text-neutral-900"
                  >
                    support@tikkr.se
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-10 border-t border-neutral-200 pt-6 text-xs text-neutral-400">
          © {new Date().getFullYear()} TERAFALK AB. Priser exklusive moms.
        </p>
      </div>
    </footer>
  );
}
