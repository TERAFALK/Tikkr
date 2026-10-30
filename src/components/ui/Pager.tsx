import Link from "next/link";
import {
  listHref,
  PER_PAGE,
  PER_PAGE_CHOICES,
  type Paging,
} from "@/lib/paging";

/**
 * SIDBLÄDDRINGEN, SAMMA PÅ VARJE LISTA.
 *
 * Föregående, nästa, var man befinner sig och hur många rader en sida bär. Inga
 * numrerade sidknappar: med tio sidor är de överflödiga och med tusen ryms de
 * inte, och den som verkligen letar efter något gammalt är hjälpt av sökning,
 * inte av att kunna hoppa till sida 47.
 *
 * Länkar och inte knappar. Ett sidnummer i adressen går att spara, skicka
 * vidare och backa ur, vilket ingen JavaScript-lösning ger gratis.
 *
 * Syns inte alls när hela listan ryms i förvalet (`PER_PAGE`). Det avgörs på
 * antalet rader och inte på antalet sidor: den som valt 100 på en lista med 80
 * rader har en sida, men ska fortfarande kunna välja om.
 *
 * Ett nytt radantal börjar om på sidan ett. Sida 7 med 25 rader säger ingenting
 * om var man hamnar med 100.
 */
export default function Pager({
  paging,
  total,
  unit,
  path,
  keep,
  anchor,
}: {
  paging: Paging;
  total: number;
  /** Vad raderna är, i plural: "händelser", "företag". */
  unit: string;
  path: string;
  /** Filtren som följer med mellan sidorna. Tomma värden utelämnas. */
  keep?: Record<string, string | undefined>;
  /** Listans id, när den ligger långt ner på sidan. Se `listHref`. */
  anchor?: string;
}) {
  if (total <= PER_PAGE) return null;

  const { page, pageCount, take } = paging;
  const paged = pageCount > 1;

  const hrefFor = (target: number, perPage: number = take) =>
    listHref(path, { keep, page: target, perPage, anchor });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-neutral-100 px-5 py-3">
      <p className="text-[13px] text-neutral-500">
        {paged && `Sida ${page} av ${pageCount} · `}
        {total.toLocaleString("sv-SE")} {unit}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="Rader per sida"
          className="flex items-center gap-1"
        >
          <span className="mr-1 text-[13px] text-neutral-500">Visa</span>
          {PER_PAGE_CHOICES.map((choice) => {
            const active = choice === take;

            return (
              <Link
                key={choice}
                href={hrefFor(1, choice)}
                aria-current={active ? "true" : undefined}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {choice}
              </Link>
            );
          })}
        </div>

        {paged && (
          <div className="flex gap-2">
            <Step href={hrefFor(page - 1)} disabled={page <= 1}>
              Föregående
            </Step>
            <Step href={hrefFor(page + 1)} disabled={page >= pageCount}>
              Nästa
            </Step>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Radvalet i ett sök- eller filterformulär.
 *
 * Ett GET-formulär skickar bara sina egna fält, och utan det här hade varje
 * sökning gått tillbaka till 50 rader. Sidnumret följer inte med: ett nytt
 * urval är en ny lista.
 */
export function PerPageField({ perPage }: { perPage: number }) {
  if (perPage === PER_PAGE) return null;

  return <input type="hidden" name="antal" value={perPage} />;
}

function Step({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const base =
    "rounded-md px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset";

  // Ett utgråat span i stället för en länk. En länk som inte leder någonstans
  // går ändå att trycka på med tangentbordet.
  if (disabled) {
    return (
      <span className={`${base} text-neutral-300 ring-neutral-100`}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${base} bg-white text-neutral-700 ring-neutral-200 hover:bg-neutral-50`}
    >
      {children}
    </Link>
  );
}
