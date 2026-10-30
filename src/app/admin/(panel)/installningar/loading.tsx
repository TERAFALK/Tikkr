import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

/**
 * En inställningssida medan den hämtas.
 *
 * Egen och inte panelens: den gäller bara rutan till höger, så att rubriken
 * och menyn under Inställningar står kvar när man går mellan sidorna där.
 * Panelens skelett hade ersatt dem också.
 */
export default function Loading() {
  return (
    <div role="status" className="skeleton-delay space-y-4">
      <span className="sr-only">Laddar</span>
      <Skeleton className="h-5 w-48" />
      <SkeletonTable rows={5} columns={3} />
    </div>
  );
}
