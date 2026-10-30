import { PerPageField } from "@/components/platform/Pager";
import { Button, ButtonLink } from "@/components/ui";
import { PER_PAGE } from "@/lib/paging";

/**
 * SÖKRUTAN I REGISTREN: kunder, ordrar och anställda.
 *
 * Vanligt GET-formulär, utan JavaScript. Sökningen hamnar i adressen som `q`
 * och går därmed att spara som bokmärke och skicka vidare.
 */
export default function SearchForm({
  query,
  label,
  placeholder,
  clearHref,
  perPage = PER_PAGE,
}: {
  /** Sökningen som gäller nu. Tom när ingen gjorts. */
  query: string;
  /** Vad rutan söker i, för den som inte ser platshållaren. */
  label: string;
  placeholder: string;
  /** Sidan utan sökning. */
  clearHref: string;
  /** Rader per sida just nu. Se Pager. */
  perPage?: number;
}) {
  return (
    <form className="flex w-full gap-2 sm:w-auto">
      <PerPageField perPage={perPage} />
      <input
        type="search"
        name="q"
        aria-label={label}
        defaultValue={query}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border-0 bg-white px-2.5 py-1.5 text-base text-neutral-900 sm:w-52 sm:flex-none sm:text-[13px] ring-1 ring-inset ring-neutral-400 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
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
