import type { Metadata } from "next";
import { siteUrl } from "@/lib/site-url";
import { getScreenPricing } from "@/lib/stripe";
import Reveal from "@/components/marketing/Reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import {
  AdminSection,
  Capabilities,
  Documents,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  Pricing,
  Problem,
} from "@/components/marketing/Sections";

const base = siteUrl();

/**
 * Sidan byggs om var tionde minut istället för en gång vid deploy.
 *
 * Priset hämtas numera från artikeln hos betaltjänsten. Utan den här raden
 * hade siffran bakats in när containern byggdes — och en prisändring hade
 * synts först vid nästa deploy, vilket är precis det vi vill undvika.
 */
export const revalidate = 600;

// Priset står även här, i texten sökmotorer visar. Det hämtas därför ur samma
// källa som resten av sidan — en prisändring ska inte kunna lämna kvar en
// gammal siffra i sökresultatet.
export async function generateMetadata(): Promise<Metadata> {
  const pricing = await getScreenPricing();

  return {
    title: "Tikkr — tidregistrering per order för verkstad",
    description:
      "Stämplingssystem för touchskärm. Personalen registrerar tid på rätt " +
      "order och arbetsmoment med ett tryck. Fungerar vid nätverksavbrott och " +
      "ger underlag som PDF med er egen logotyp. " +
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
        title: "Tikkr — tidregistrering per order för verkstad",
        description:
          "Tidregistrering per order och arbetsmoment, direkt i verkstaden.",
      },
    }),
  };
}

export default async function Home() {
  const pricing = await getScreenPricing();

  return (
    <div className="bg-white">
      <SiteHeader />

      {/* Hero animeras vid inladdning — den syns direkt och har inget att
          vänta på. Resten tonas in när man skrollar dit. */}
      <Hero />
      <Capabilities />

      <Reveal>
        <Problem />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <AdminSection />
      </Reveal>
      <Reveal>
        <Documents />
      </Reveal>
      <Reveal>
        <Pricing pricing={pricing} />
      </Reveal>
      <Reveal>
        <Faq />
      </Reveal>
      <Reveal>
        <FinalCta pricing={pricing} />
      </Reveal>

      <SiteFooter />
    </div>
  );
}
