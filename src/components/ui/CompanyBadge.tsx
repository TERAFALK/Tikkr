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

  if (hasLogo) {
    return (
      <span
        className="block shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-white"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/company/logo?variant=square&v=${version ?? ""}`}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-neutral-900 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
