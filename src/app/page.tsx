import type { Metadata } from "next";
import { siteUrl } from "@/lib/site-url";
import { getModulePricing, getScreenPricing } from "@/lib/stripe";
import Reveal from "@/components/marketing/Reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
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
} from "@/components/marketing/Sections";

const base = siteUrl();

/**
 * Sidan byggs om varje minut istället för en gång vid deploy.
 *
 * Två skäl. Priserna hämtas från artiklarna hos betaltjänsten, och utan den
 * här raden hade siffrorna bakats in när containern byggdes. Driftmeddelanden
 * visas dessutom överst, och ett pågående avbrott som dyker upp tio minuter
 * senare är inte värt mycket.
 */
export const revalidate = 60;

// Priset står även här, i texten sökmotorer visar. Det hämtas därför ur samma
// källa som resten av sidan — en prisändring ska inte kunna lämna kvar en
// gammal siffra i sökresultatet.
export async function generateMetadata(): Promise<Metadata> {
  const pricing = await getScreenPricing();

  return {
    title: "Tikkr · Tidregistrering per order för verkstad",
    description:
      "Stämplingssystem för touchskärm. Personalen registrerar tid på rätt " +
      "order och arbetsmoment med ett tryck. Underlag per order, efterkalkyl " +
      "och tidrapport. " +
      `${pricing.month.toLocaleString("sv-SE")} kr per stämplingsskärm och månad.`,

    // Talar om vilken adress som är den riktiga. Utan den kan tikkr.se och
    // www.tikkr.se räknas som två sidor med samma innehåll, och deras värde
    // delas upp på båda istället för att samlas på en.
    ...(base && {
      metadataBase: new URL(base),
      alternates: { canonical: "/" },
      openGraph: {
        type: "website",
        locale: "sv_SE",
        url: base,
        siteName: "Tikkr",
        title: "Tikkr · Tidregistrering per order för verkstad",
        description:
          "Tidregistrering per order och arbetsmoment, direkt i verkstaden.",
      },
    }),
  };
}

export default async function Home() {
  // Hämtas parallellt. Båda ligger bakom samma korta minne i stripe.ts, så
  // det är en fråga till betaltjänsten och inte två.
  const [pricing, modules] = await Promise.all([
    getScreenPricing(),
    getModulePricing(),
  ]);

  return (
    <div className="bg-white">
      <SiteHeader />

      {/* Hero och sifferraden animeras vid inladdning — de syns direkt och
          har inget att vänta på. Resten tonas in när man skrollar dit. */}
      <Hero pricing={pricing} />
      <Facts pricing={pricing} />

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
        <Documents modules={modules} />
      </Reveal>
      <Reveal>
        <Capabilities />
      </Reveal>
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
