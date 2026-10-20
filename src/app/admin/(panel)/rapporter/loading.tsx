import {
  SkeletonFilter,
  SkeletonPage,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/** Rapporter medan rapporten räknas. Samma form som sidan, se page.tsx. */
export default function Loading() {
  return (
    <SkeletonPage action>
      <SkeletonFilter fields={8} />
      <SkeletonStats />
      <SkeletonTable rows={10} columns={6} />
    </SkeletonPage>
  );
}
