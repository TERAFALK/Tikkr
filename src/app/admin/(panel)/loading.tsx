import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

/**
 * Det som står i panelen medan en sida hämtas.
 *
 * Utan den här filen hände ingenting synligt mellan ett klick i menyn och
 * att servern svarat: den gamla sidan stod kvar, och man tryckte igen. Nu
 * byts innehållet direkt och menyn står still.
 *
 * Gäller varje sida som inte har en egen. De som ser annorlunda ut nog för
 * att ett allmänt skelett skulle hoppa när innehållet kommer har det.
 */
export default function Loading() {
  return (
    <SkeletonPage action>
      <SkeletonTable />
    </SkeletonPage>
  );
}
