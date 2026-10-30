import Link from "next/link";

/**
 * SIDBLÄDDRING.
 *
 * Föregående, nästa, och var man befinner sig. Inga numrerade sidknappar:
 * med tio sidor är de överflödiga och med tusen ryms de inte, och den som
 * verkligen letar efter något gammalt är hjälpt av sökning, inte av att kunna
 * hoppa till sida 47.
 *
 * Länkar och inte knappar. Ett sidnummer i adressen går att spara, skicka
 * vidare och backa ur, vilket ingen JavaScript-lösning ger gratis.
 *
 * Visas inte alls när allt får plats på en sida, utom med `sizes`: den som valt
 * 100 rader och fått plats med allt måste kunna välja om. Se ListPager.
 */
export default function Pager({
  page,
  pageCount,
  total,
  unit,
  hrefFor,
  sizes,
}: {
  page: number;
  pageCount: number;
  total: number;
  /** Vad raderna är, i plural: "händelser", "företag". */
  unit: string;
  hrefFor: (page: number) => string;
  /** Valet av rader per sida. Utelämnat ger bara bläddringen. */
  sizes?: {
    current: number;
    choices: number[];
    hrefFor: (perPage: number) => string;
  };
}) {
  if (pageCount <= 1 && !sizes) return null;

  const paged = pageCount > 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-neutral-100 px-5 py-3">
      <p className="text-[13px] text-neutral-500">
        {paged && `Sida ${page} av ${pageCount} · `}
        {total.toLocaleString("sv-SE")} {unit}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {sizes && (
          <div
            role="group"
            aria-label="Rader per sida"
            className="flex items-center gap-1"
          >
            <span className="mr-1 text-[13px] text-neutral-500">Visa</span>
            {sizes.choices.map((choice) => {
              const active = choice === sizes.current;

              return (
                <Link
                  key={choice}
                  href={sizes.hrefFor(choice)}
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
        )}

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
