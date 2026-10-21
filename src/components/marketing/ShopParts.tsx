import type { ProductImage } from "@/lib/shop/catalog";

/**
 * DELAR SOM BUTIKEN OCH PRODUKTSIDAN DELAR.
 *
 * Bilden bär sin märkning: en ritning märks "Illustration" där den visas, så
 * att den aldrig kan tas för ett foto av det kunden får. Märkningen följer
 * flaggan i katalogen och försvinner av sig själv när ett foto lagts in.
 */
export function ProductFigure({
  image,
  priority = false,
  className = "",
}: {
  image: ProductImage;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt={image.alt}
          width={1200}
          height={900}
          loading={priority ? "eager" : "lazy"}
          className="h-auto w-full"
        />
        {image.illustration && (
          <figcaption className="absolute bottom-3 left-3 rounded bg-white/90 px-2 py-0.5 text-[11px] font-medium text-neutral-600 ring-1 ring-neutral-200">
            Illustration
          </figcaption>
        )}
      </div>
    </figure>
  );
}

/** Beloppet i hela kronor när det går, "24 900 kr". */
export function kronor(ore: number): string {
  const value = ore / 100;
  const text = Number.isInteger(value)
    ? value.toLocaleString("sv-SE")
    : value.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} kr`;
}

/**
 * Adressen beställningen börjar på: inloggningen, som skickar vidare till
 * butikens kassa i panelen med en av produkten i korgen. Den som redan är
 * inloggad går rakt igenom, se login/page.tsx.
 */
export function orderHref(slug: string): string {
  const target = `/admin/butik/kassa?${slug}=1`;
  return `/admin/login?till=${encodeURIComponent(target)}`;
}
