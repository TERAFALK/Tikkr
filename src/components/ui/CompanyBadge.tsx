import ImageWithFallback from "@/components/ui/ImageWithFallback";

/**
 * Företagsmärket — logotyp om kunden laddat upp en, annars initialen.
 *
 * Används i adminpanelens sidomeny och i stämplingsskärmens huvud, så att en
 * kund som lagt in sin logotyp ser den på båda ställena.
 *
 * Bilden fyller rutan helt. Det är därför den kvadratiska logotypen är en egen
 * uppladdning: en bred logotyp som klämts in i en fyrkant blir en tunn remsa
 * med luft över och under, vilket ser ut som ett fel snarare än ett märke.
 *
 * Vanlig img-tagg och inte Next-komponenten för bilder: den senare vill
 * optimera och mellanlagra, vilket kräver att bilden går att nå utan
 * inloggning.
 */
export default function CompanyBadge({
  companyName,
  hasLogo,
  size = 32,
  version,
}: {
  companyName: string;
  hasLogo: boolean;
  size?: number;
  /** Tidsstämpel som byter när logotypen ändras, så gammal bild inte visas. */
  version?: string | null;
}) {
  const initial = companyName.trim().charAt(0).toUpperCase() || "T";

  const letter = (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-neutral-900 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );

  if (!hasLogo) return letter;

  // Initialen är också reserven när logotypen inte går att hämta. En vit
  // ruta såg ut som en tom logotyp, inte som en som saknas.
  return (
    <ImageWithFallback
      src={`/api/company/logo?variant=square&v=${version ?? ""}`}
      style={{ width: size, height: size }}
      className="block shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-white object-cover"
      fallback={letter}
    />
  );
}
