import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getModulePricing, getScreenPricing } from "@/lib/stripe";
import Reveal from "@/components/marketing/Reveal";
import { Seam } from "@/components/marketing/Atmosphere";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import StructuredData from "@/components/marketing/StructuredData";
import {
  AdminSection,
  Capabilities,
  Documents,
  Facts,
  Faq,
  FinalCta,
  Hero,
  HowItWorks,
  Pricing,
  Problem,
  Surfaces,
} from "@/components/marketing/Sections";

/**
 * Sidan byggs om varje minut istället för en gång vid deploy.
 *
 * Två skäl. Priserna hämtas från artiklarna hos betaltjänsten, och utan den
 * här raden hade siffrorna bakats in när containern byggdes. Driftmeddelanden
 * visas dessutom överst, och ett pågående avbrott som dyker upp tio minuter
 * senare är inte värt mycket.
 */
export const revalidate = 60;

// INGET PRIS I BESKRIVNINGEN. Den är det första en besökare ser, i
// sökresultatet, och priset hör hemma längre ned på sidan när det står klart
// vad man får. Siffran stod här tidigare och gjorde texten till en prislapp.
export const metadata: Metadata = pageMetadata({
  path: "/",
  title: "Tikkr · Tidregistrering per order för verkstad",
  description:
    "Stämplingssystem för pekskärm. Personalen registrerar tid på rätt " +
    "order och arbetsmoment med ett tryck. Underlag per order, efterkalkyl " +
    "och tidrapport, med drift och support i Sverige.",
  // Kortare i ett delningskort, där raden klipps efter ett par rader ändå.
  shareDescription:
    "Tidregistrering per order och arbetsmoment, direkt i verkstaden.",
});

/**
 * SIDANS ORDNING OCH DESS SKARVAR.
 *
 * Avsnitten ligger på var sin yta, och ordningen är satt i `Sections.tsx`:
 * Fjord, Snö, vit, Fjord, Snö, vit, Fjord, vit, Snö, Tick.
 *
 * SKARVARNA SITTER HÄR OCH INTE I AVSNITTEN. En skarv går mellan TVÅ ytor och
 * måste känna dem båda; skrev varje avsnitt sin egen halva av övergången till
 * nästa skulle de två halvorna behöva hållas i takt med varandra, och de
 * hinner alltid sluta vara det. Här står hela ordningen i en följd, och en
 * felaktig skarv syns i samma blick som den skrivs. Samma skäl som att orderns
 * totala beräkning aldrig lagras på två ställen, se CLAUDE.md § 3 regel 6.
 *
 * SKARVARNA LIGGER UTANFÖR `Reveal`. En övergång mellan två ytor som tonas in
 * när man skrollar dit är en remsa som blinkar till mitt i resan.
 */
export default async function Home() {
  // Hämtas parallellt. Båda ligger bakom samma korta minne i stripe.ts, så
  // det är en fråga till betaltjänsten och inte två.
  const [pricing, modules] = await Promise.all([
    getScreenPricing(),
    getModulePricing(),
  ]);

  return (
    <div className="marketing-page bg-white">
      <StructuredData pricing={pricing} modules={modules} />
      <SiteHeader />

      {/* Hero och sifferraden animeras vid inladdning — de syns direkt och
          har inget att vänta på. Resten tonas in när man skrollar dit. */}
      <Hero />
      <Facts />

      <Seam tone="darkToLight" />
      <Reveal>
        <Problem />
      </Reveal>

      <Seam tone="lightToWhite" />
      <Reveal>
        <HowItWorks />
      </Reveal>

      {/* Gångjärnet mellan verkstaden och kontoret. Står utanför `Reveal`:
          bandet drar förbi av sig själv, och en intoning ovanpå ett pågående
          drag läses som att bandet hakar upp sig vid ankomsten. */}
      <Seam tone="whiteToDark" />
      <Surfaces />

      <Seam tone="darkToLight" />
      <Reveal>
        <AdminSection />
      </Reveal>

      <Seam tone="lightToWhite" />
      <Reveal>
        <Documents />
      </Reveal>

      <Seam tone="whiteToDark" />
      <Reveal>
        <Capabilities />
      </Reveal>

      <Seam tone="darkToWhite" />
      <Reveal>
        <Pricing pricing={pricing} modules={modules} />
      </Reveal>

      <Seam tone="whiteToLight" />
      <Reveal>
        <Faq modules={modules} />
      </Reveal>

      <Seam tone="lightToTick" />
      <Reveal>
        <FinalCta pricing={pricing} />
      </Reveal>

      {/* Den sista skarven ligger här och inte i foten. Foten står också på de
          rättsliga sidorna och i hjälpcentret, där ytan ovanför är en annan. */}
      <Seam tone="tickToDark" />
      <SiteFooter />
    </div>
  );
}
