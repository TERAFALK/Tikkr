import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Tikkr — tidregistrering per order för verkstad",
  description:
    "Stämplingssystem för touchskärm. Ett tryck registrerar tid på rätt order och arbetsmoment. Fungerar utan nät, exporterar till Excel. 399 kr per skärm och månad.",
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
