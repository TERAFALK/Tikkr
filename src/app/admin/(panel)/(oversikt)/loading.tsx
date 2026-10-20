import {
  SkeletonPage,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/Skeleton";

/**
 * Översikten medan den hämtas, i översiktens egen form.
 *
 * Översikten ligger i en egen grupp, `(oversikt)`, bara för att få den här
 * filen. Panelens allmänna skelett gäller sidorna under den, och en
 * laddningsfil bredvid översiktens page.tsx hade gällt dem allihop.
 */
export default function Loading() {
  return (
    <SkeletonPage action>
      <SkeletonStats />
      <div className="grid gap-6 lg:grid-cols-3">
        <SkeletonTable rows={4} columns={5} className="lg:col-span-2" />
        <SkeletonTable rows={3} columns={1} />
      </div>
    </SkeletonPage>
  );
}
