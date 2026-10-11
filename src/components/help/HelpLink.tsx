import { IconHelp } from "@/components/ui/icons";
import type { GuideSlug } from "@/lib/help/guides";

/**
 * LÄNKEN TILL RÄTT GUIDE, VID FUNKTIONEN DEN GÄLLER.
 *
 * Öppnar guiden i en ny flik. Den som är mitt i ett formulär ska inte tappa
 * det den skrivit för att den ville läsa hur något fungerar.
 *
 * `guide` är en GuideSlug och inte en sträng. En länk till en guide som tagits
 * bort eller bytt namn blir därmed ett typfel vid bygget, inte en sida som
 * svarar 404 när kunden väl trycker. tests/help.test.ts fångar samma sak i
 * källkoden, för säkerhets skull.
 *
 * ADRESSEN ÄR RELATIV, /support/<guide>. På portaladressen skickar
 * middleware.ts vidare till säljsidan, där hjälpcentret bor. Länken behöver
 * därmed inte veta vilken adress säljsidan har, och fungerar likadant där allt
 * ligger på samma adress.
 *
 * BARA TYPEN IMPORTERAS, inte guiderna. Komponenten dras in via PageHeader i
 * designsystemet, som också används av stämplingsskärmen, och all guidetext
 * hade då följt med till varje skärm i verkstaden.
 */
export default function HelpLink({
  guide,
  className = "",
}: {
  guide: GuideSlug;
  className?: string;
}) {
  return (
    <a
      href={`/support/${guide}`}
      target="_blank"
      rel="noopener"
      aria-label="Hjälp, öppnas i en ny flik"
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 ${className}`}
    >
      <IconHelp className="text-neutral-400" />
      Hjälp
    </a>
  );
}
