import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

/**
 * Det som står i plattformspanelen medan en sida hämtas. Samma skelett som
 * kundpanelen, se src/app/admin/(panel)/loading.tsx.
 */
export default function Loading() {
  return (
    <SkeletonPage action>
      <SkeletonTable />
    </SkeletonPage>
  );
}
