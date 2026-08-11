import type { Metadata } from "next";
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
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <AdminSection />
      <Pricing />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}
