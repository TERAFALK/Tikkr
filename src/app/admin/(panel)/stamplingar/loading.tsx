import {
  SkeletonFilter,
  SkeletonPage,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/** Stämplingar medan listan hämtas. Samma form som sidan, se page.tsx. */
export default function Loading() {
  return (
    <SkeletonPage action>
      <SkeletonFilter />
      <SkeletonTable rows={10} columns={6} />
    </SkeletonPage>
  );
}
