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
 * Visas inte alls när allt får plats på en sida.
 */
export default function Pager({
  page,
  pageCount,
  total,
  unit,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  total: number;
  /** Vad raderna är, i plural: "händelser", "företag". */
  unit: string;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 border-t border-neutral-100 px-5 py-3">
      <p className="text-[13px] text-neutral-500">
        Sida {page} av {pageCount} · {total.toLocaleString("sv-SE")} {unit}
      </p>

      <div className="flex gap-2">
        <Step href={hrefFor(page - 1)} disabled={page <= 1}>
          Föregående
        </Step>
        <Step href={hrefFor(page + 1)} disabled={page >= pageCount}>
          Nästa
        </Step>
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
