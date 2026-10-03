import Link from "next/link";
import { Wordmark } from "@/components/ui/Logo";
import Motif from "./Motif";
import { activeNotices } from "@/lib/notices";
import ContactLine from "./ContactLine";
import SiteNav from "./SiteNav";
import { CONTACT } from "@/lib/contact";
import { LEGAL, NAV } from "./links";

/*
  LEGAL exporteras vidare härifrån. Länklistorna bor i `links.ts` sedan menyn
  blev en klientkomponent, men adresserna refereras på flera håll som
  `SiteChrome`-export, och ett byte där ger inget tillbaka.
*/
export { LEGAL };

/**
 * Toppmeny och sidfot för säljsidan.
 *
 * Menyn följer med när man skrollar. På en sida där beslutet fattas långt ner
 * ska knappen som leder vidare aldrig vara utanför skärmen.
 *
 * BÅDA ÄR FJORD, och det är avsiktligt desamma. Sidan växlar mellan ljusa och
 * mörka ytor på vägen ned; ramar man in den med samma mörka yta i topp och
 * botten blir växlingen ett innehåll och inte ett lapptäcke.
 *
 * Menyn ligger kvar som halvgenomskinlig med oskärpa bakom sig. Över hero syns
 * den knappt alls, vilket är rätt — där ska rubriken ta plats. Över ett vitt
 * avsnitt blir den en tydlig mörk list, vilket också är rätt, eftersom det är
 * då man letar efter den.
 *
 * Enda färgen är knappen som leder vidare: Tick på mörkt, enligt guiden.
 */


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
    <div className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-6 py-2.5">
        {notices.map((notice) => (
          <p
            key={notice.id}
            className="flex items-start gap-2 text-[13px] leading-relaxed text-neutral-400"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                notice.kind === "INCIDENT" ? "bg-amber-500" : "bg-neutral-500"
              }`}
            />
            <span>
              <span className="font-medium text-white">{notice.title}.</span>{" "}
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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-900/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3.5">
        <Link href="/" aria-label="Tikkr, till startsidan">
          <Wordmark size={26} tone="reversed" />
        </Link>

        <SiteNav />

        <div className="ml-auto flex items-center gap-4">
          <Link
            href="/admin/login"
            className="text-[13px] text-neutral-400 transition-colors hover:text-white"
          >
            Logga in
          </Link>
          <Link
            href="/registrera"
            className="rounded-md bg-tick px-3.5 py-2 text-[13px] font-semibold text-neutral-900 transition-colors hover:bg-emerald-300"
          >
            Prova gratis
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const columns = [
    { title: "Produkt", links: NAV },
    {
      title: "Konto",
      links: [
        { href: "/registrera", label: "Skapa arbetsyta" },
        { href: "/admin/login", label: "Logga in" },
      ],
    },
    { title: "Villkor", links: LEGAL },
  ];

  return (
    <footer className="relative overflow-hidden bg-neutral-900">
      {/* Motivet en sista gång, nedsänkt i hörnet. Sidan började med det och
          slutar med det. */}
      <Motif tone="onDark" className="-bottom-72 -left-40 h-[36rem] w-[36rem]" />

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Wordmark size={26} tone="reversed" />
            <p className="mt-5 text-[13px] leading-relaxed text-neutral-400">
              Tidregistrering per order och arbetsmoment för svensk
              verkstadsindustri. Drift och support i Sverige.
            </p>
            <p className="mt-4 text-[13px] text-neutral-400">
              En del av{" "}
              <span className="font-medium text-neutral-300">TERAFALK AB</span>
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-tick">
                {column.title}
              </p>
              <ul className="mt-4 space-y-2.5 text-[13px]">
                {column.links.map((item) => (
                  <li key={item.href}>
                    {/* Ankarlänkar till startsidan är vanliga a-taggar. Next
                        hanterar dem, men Link vill helst peka på en sida. */}
                    {item.href.startsWith("/#") ? (
                      <a
                        href={item.href}
                        className="text-neutral-400 transition-colors hover:text-white"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-neutral-400 transition-colors hover:text-white"
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-800 pt-6">
          <p className="text-xs text-neutral-400">
            © {new Date().getFullYear()} TERAFALK AB. Priser exklusive moms.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <ContactLine tone="dark" size="xs" />
            <a
              href={`mailto:${CONTACT.email}`}
              className="text-xs text-neutral-400 transition-colors hover:text-white"
            >
              {CONTACT.email}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
