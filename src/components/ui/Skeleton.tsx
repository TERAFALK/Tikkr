/**
 * SKELETT MEDAN EN SIDA LADDAS (2026-10-20).
 *
 * Ett skelett har sidans form: samma kort, samma rader, samma höjder. När
 * innehållet kommer ska det lägga sig där skelettet låg, inte trycka ned allt
 * under sig — en sida som hoppar när den laddat färdigt får en att trycka på
 * fel rad.
 *
 * Bitarna här är byggda på designsystemets egna mått (Card, Stat, CardHeader,
 * tabellraderna i index.tsx). Ändras ett av dem ändras det här också, annars
 * börjar skelettet ljuga om vad som kommer.
 *
 * Skelettet syns först efter 150 ms och pulserar inte för den som bett om
 * mindre rörelse. Båda reglerna står i globals.css, under `.skeleton`.
 *
 * Inga klientkomponenter: skelettet ska synas innan något JavaScript kört.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
}

/** Ett kort som väntar på sitt innehåll. Samma ram som `Card`. */
function SkeletonCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-white ${className}`}
    >
      {children}
    </div>
  );
}

/** Raden med nyckeltal. Samma rutnät och höjd som `Stat`. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} className="px-5 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2.5 h-7 w-16" />
        </SkeletonCard>
      ))}
    </div>
  );
}

/**
 * Ett kort med rubrik och tabell. Raderna har varierande längd, så att det
 * ser ut som text och inte som ett rutmönster.
 */
export function SkeletonTable({
  rows = 8,
  columns = 5,
  className = "",
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-2/5", "w-1/3"];

  return (
    <SkeletonCard className={className}>
      <div className="border-b border-neutral-200 px-5 py-4">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="border-b border-neutral-200 bg-neutral-50/70 px-4 py-2.5">
        <Skeleton className="h-3 w-1/3" />
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="grid gap-4 border-b border-neutral-100 px-4 py-3 last:border-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={`h-3.5 ${widths[(row + column) % widths.length]}`}
            />
          ))}
        </div>
      ))}
    </SkeletonCard>
  );
}

/** Ett filterkort: rubrik och en rad fält. */
export function SkeletonFilter({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonCard>
      <div className="border-b border-neutral-200 px-5 py-4">
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index}>
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="mt-2 h-8 w-full" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

/**
 * En hel sida som laddas: rubrik och det man skickar in under den.
 *
 * `role="status"` och en text för skärmläsaren. Ett skelett är tyst för den
 * som inte ser det, och då vet man inte att något är på väg.
 */
export function SkeletonPage({
  children,
  action = false,
}: {
  children: React.ReactNode;
  /** En knapp till höger om rubriken, som på de flesta sidor. */
  action?: boolean;
}) {
  return (
    <div role="status" className="skeleton-delay">
      <span className="sr-only">Laddar</span>
      <div className="mb-6 flex items-start justify-between gap-4">
        <Skeleton className="h-7 w-40" />
        {action && <Skeleton className="h-8 w-28 rounded-md" />}
      </div>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
