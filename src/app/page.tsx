import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getModulePricing, getScreenPricing } from "@/lib/stripe";
import { productBySlug } from "@/lib/shop/products";
import Reveal from "@/components/marketing/Reveal";
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
  ScreenHardware,
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
 * SIDANS ORDNING OCH DESS YTOR.
 *
 * Avsnitten ligger på var sin yta, och ordningen är satt i `Sections.tsx`:
 * Fjord, Snö, vit, Snö, vit, Fjord, Snö, vit, Snö, Tick. Stämplingsskärmen
 * ligger på Snö efter innehållet, och priset fick därför en hårlinje.
 *
 * YTORNA MÖTS I EN RAK KANT. Mellan avsnitten låg tidigare en tonad skarv som
 * smetade ut den ena färgen i den andra över ett par centimeter. Den syntes
 * som ett grumligt band tvärs över sidan, och nio sådana band gjorde att
 * sidan såg suddig ut i stället för sammanhållen. En rak kant mellan två
 * ytor är inget ögat snubblar på — det är så en sida med tryckta ytor ser ut.
 *
 * DE TVÅ LJUSA YTORNA SKILJS AV EN HÅRLINJE. Snö och vitt ligger nära
 * varandra, och utan linje läses kanten som ett misstag i stället för som ett
 * byte. Linjen står på avsnittet som ligger UNDER, eftersom bara det vet vad
 * som kom före. Mot en mörk eller grön yta behövs ingen: kontrasten är kanten.
 */
export default async function Home() {
  // Hämtas parallellt. Båda ligger bakom samma korta minne i stripe.ts, så
  // det är en fråga till betaltjänsten och inte två.
  const [pricing, modules, screen] = await Promise.all([
    getScreenPricing(),
    getModulePricing(),
    // Stämplingsskärmen ur butiken. Utan databas, som när sidan byggs, eller
    // när skärmen är dold på säljsidan, visas inte avsnittet.
    productBySlug("stamplingsskarm", "site").catch(() => null),
  ]);

  return (
    <div className="marketing-page bg-white">
      <StructuredData pricing={pricing} modules={modules} />
      <SiteHeader />

      {/* Hero och sifferraden animeras vid inladdning — de syns direkt och
          har inget att vänta på. Resten tonas in när man skrollar dit. */}
      <Hero />
      <Facts />

      <Reveal>
        <Problem />
      </Reveal>

      <Reveal>
        <HowItWorks />
      </Reveal>

      <Reveal>
        <AdminSection />
      </Reveal>

      <Reveal>
        <Documents />
      </Reveal>

      <Reveal>
        <Capabilities />
      </Reveal>

      {screen && (
        <Reveal>
          <ScreenHardware product={screen} />
        </Reveal>
      )}

      <Reveal>
        <Pricing pricing={pricing} modules={modules} />
      </Reveal>

      <Reveal>
        <Faq modules={modules} />
      </Reveal>

      <Reveal>
        <FinalCta pricing={pricing} />
      </Reveal>

      <SiteFooter />
    </div>
  );
}
