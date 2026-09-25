import { requireAdmin } from "@/lib/admin-session";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";

/**
 * SIDAN MAN HAMNAR PÅ NÄR NÅGOT SKULLE SPARAS I SUPPORTLÄGE.
 *
 * Tidigare kastade `assertWritable()` ett undantag, och eftersom adminpanelen
 * saknade felgräns möttes man av ramverkets råa felsida: engelsk text, ett
 * spårnings-id och ingen antydan om vad som hänt. Ett VÄNTAT nej ska inte se ut
 * som en krasch.
 *
 * Nu leder refusalen hit i stället. Sidan ligger inne i panelen, så menyn och
 * den röda bannern står kvar — det är en del av svaret på varför sparandet inte
 * gick igenom.
 *
 * Ligger under adminpanelen och inte i plattformen, eftersom det är HÄR man är
 * när det händer. En omdirigering till plattformen hade dessutom kastat ut en
 * kund som råkade landa på adressen.
 */

export const dynamic = "force-dynamic";

export default async function ReadOnlyPage() {
  const session = await requireAdmin();

  return (
    <>
      <PageHeader
        title="Ändringen sparades inte"
        description={
          session.support
            ? `Du ser ${session.companyName} som support, och supportläget får bara läsa.`
            : "Sidan visas när en ändring nekats."
        }
      />

      {session.support ? (
        <Card className="p-5">
          <p className="text-sm text-neutral-700">
            Ingenting ändrades. Läsläget finns för att en felsökning aldrig ska
            råka bli en ändring i kundens fakturaunderlag.
          </p>

          <p className="mt-3 text-sm text-neutral-700">
            Behöver något rättas: be kunden göra det själva, eller logga in som
            dem med deras medgivande. Vill du bara se hur det ser ut går allt
            utom sparaknapparna att använda.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/admin">Tillbaka till översikten</ButtonLink>
            <ButtonLink href="/admin/rapporter" tone="secondary">
              Till rapporter
            </ButtonLink>
          </div>
        </Card>
      ) : (
        /* En vanlig administratör har inget att göra här. Kan hända om någon
           sparat adressen som bokmärke, eller följt en länk ur ett gammalt
           supportbesök. */
        <EmptyState
          title="Inget att se här"
          description="Sidan visas bara när en ändring nekats i supportläge."
        />
      )}
    </>
  );
}
