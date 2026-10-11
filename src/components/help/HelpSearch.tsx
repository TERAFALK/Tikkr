"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { searchGuides } from "@/lib/help/search";

/**
 * SÖKFÄLTET ÖVERST I HJÄLPCENTRET.
 *
 * Träffarna visas medan man skriver, direkt under fältet. Ingen knapp och
 * ingen sidladdning: guiderna finns redan i webbläsaren, se lib/help/search.ts.
 *
 * Står på mörk botten i bandet, och fältet är därför vitt med synlig kant
 * mot det mörka, inte ett mörkt fält med ljus text. Det ska se ut som något
 * man skriver i.
 */
export default function HelpSearch() {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchGuides(query), [query]);
  const listId = useId();

  const searching = query.trim().length > 0;

  return (
    <div role="search">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Sök i hjälpcentret
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Sök, t.ex. koppla skärm"
        autoComplete="off"
        aria-controls={listId}
        className="block w-full rounded-lg border border-neutral-400 bg-white px-4 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-tick"
      />

      <div id={listId} aria-live="polite">
        {searching && hits.length === 0 && (
          <p className="mt-4 text-[13px] text-neutral-400">
            Ingen guide matchar &quot;{query.trim()}&quot;
          </p>
        )}

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-lg bg-white">
            {hits.map((hit) => (
              <li key={hit.slug}>
                <Link
                  href={`/support/${hit.slug}`}
                  className="block px-4 py-3 transition-colors hover:bg-neutral-50"
                >
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                    {hit.areaLabel}
                  </span>
                  <span className="mt-0.5 block text-[15px] font-medium text-neutral-900">
                    {hit.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-neutral-500">
                    {hit.summary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
