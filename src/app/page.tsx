import type { Metadata } from "next";
import { siteUrl } from "@/lib/site-url";
import Reveal from "@/components/marketing/Reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import {
  AdminSection,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  Pricing,
  Problem,
} from "@/components/marketing/Sections";

const base = siteUrl();

export const metadata: Metadata = {
  title: "Tikkr — tidregistrering per order för verkstad",
  description:
    "Stämplingssystem för touchskärm. Ett tryck registrerar tid på rätt order och arbetsmoment. Fungerar utan nät, underlag som PDF med er egen logotyp. 399 kr per skärm och månad.",

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
        "Ett tryck på skärmen i verkstaden, så vet du hur mycket tid som lagts på varje order.",
    },
  }),
};

export default function Home() {
  return (
    <div className="bg-white">
      <SiteHeader />

      {/* Hero animeras vid inladdning — den syns direkt och har inget att
          vänta på. Resten tonas in när man skrollar dit. */}
      <Hero />

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
        <Pricing />
      </Reveal>
      <Reveal>
        <Faq />
      </Reveal>
      <Reveal>
        <FinalCta />
      </Reveal>

      <SiteFooter />
    </div>
  );
}
