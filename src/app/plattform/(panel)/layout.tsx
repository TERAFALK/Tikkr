import { requirePlatformAdmin } from "@/lib/platform-admin";
import PlatformShell from "@/components/platform/PlatformShell";

/**
 * SKALET RUNT PLATTFORMSPANELENS SIDOR (2026-10-20).
 *
 * Varje sida ritade förut sin egen ram, och ramen byggdes därför om vid varje
 * sidbyte: menyn ritades om och siffran vid Inkorg hämtades på nytt. Nu står
 * ramen här, en gång, och står still medan innehållet byts — samma ordning
 * som kundpanelen.
 *
 * Gruppen `(panel)` finns för att inloggningen ska ligga UTANFÖR skalet. Låg
 * den innanför skulle den kräva inloggning för att visa inloggningen.
 *
 * Behörigheten prövas här för ramens skull, och fortfarande i varje sida och
 * varje serveråtgärd för sig. En layout ritas inte om vid varje anrop, och en
 * serveråtgärd går aldrig genom den.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email } = await requirePlatformAdmin();

  return <PlatformShell email={email}>{children}</PlatformShell>;
}
