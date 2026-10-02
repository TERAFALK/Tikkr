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

// INGET PRIS I BESKRIVNINGEN. Den är det första en besökare ser, i
// sökresultatet, och priset hör hemma längre ned på sidan när det står klart
// vad man får. Siffran stod här tidigare och gjorde texten till en prislapp.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Tikkr · Tidregistrering per order för verkstad",
    description:
      "Stämplingssystem för pekskärm. Personalen registrerar tid på rätt " +
      "order och arbetsmoment med ett tryck. Underlag per order, efterkalkyl " +
      "och tidrapport, med drift och support i Sverige.",

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
    <div className="marketing-page bg-white">
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
