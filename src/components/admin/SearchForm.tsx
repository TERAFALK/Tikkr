import { Button, ButtonLink } from "@/components/ui";
import { PER_PAGE } from "@/lib/paging";

/**
 * SÖKRUTAN I REGISTREN: kunder, ordrar och anställda.
 *
 * Vanligt GET-formulär, utan JavaScript. Sökningen hamnar i adressen som `q`
 * och går därmed att spara som bokmärke och skicka vidare.
 *
 * Valet av rader per sida följer med, men inte sidnumret: en ny sökning är en
 * ny lista.
 */
export default function SearchForm({
  query,
  placeholder,
  clearHref,
  perPage = PER_PAGE,
}: {
  /** Sökningen som gäller nu. Tom när ingen gjorts. */
  query: string;
  placeholder: string;
  /** Sidan utan sökning. */
  clearHref: string;
  /** Rader per sida just nu. Se ListPager. */
  perPage?: number;
}) {
  return (
    <form className="flex gap-2">
      {perPage !== PER_PAGE && (
        <input type="hidden" name="antal" value={perPage} />
      )}
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder={placeholder}
        className="w-52 rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-400 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
      />
      <Button type="submit" tone="secondary">
        Sök
      </Button>
      {query && (
        <ButtonLink href={clearHref} tone="ghost">
          Rensa
        </ButtonLink>
      )}
    </form>
  );
}
