import {
  SkeletonFilter,
  SkeletonPage,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/** Tidrapporten medan den räknas. Samma form som sidan, se page.tsx. */
export default function Loading() {
  return (
    <SkeletonPage action>
      <SkeletonFilter />
      <SkeletonStats />
      <SkeletonTable rows={7} columns={6} />
    </SkeletonPage>
  );
}
