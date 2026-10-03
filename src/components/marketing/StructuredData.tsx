import { siteUrl } from "@/lib/site-url";
import type { ModulePricing, ScreenPricing } from "@/lib/stripe";
import { faqQuestions } from "./faq-data";

/**
 * STRUKTURERAD DATA FÖR SÄLJSIDAN.
 *
 * Samma uppgifter som står på sidan, i det format sökmotorer läser maskinellt.
 * Projektet hade ingen alls.
 *
 * VAD DET FAKTISKT GER, utan överdrifter:
 *
 * - `Organization` är den som bär värdet. Den knyter ihop domänen med
 *   TERAFALK AB och är det Google använder för att förstå vem som står bakom
 *   en sajt.
 * - `SoftwareApplication` med `offers` beskriver vad som säljs och till vilket
 *   pris.
 * - `FAQPage` ger INTE rika resultat. Google begränsade dem 2023 till
 *   myndighets- och hälsosidor, så Tikkr får dem inte. Markupen är ändå
 *   korrekt, kostar ingenting och läses av andra än Google. Men den som
 *   förväntar sig utfällbara frågor i sökresultatet kommer att bli besviken,
 *   och det ska stå här och inte upptäckas om ett halvår.
 *
 * Renderas bara när MARKETING_HOST är satt. Utan en publik adress finns ingen
 * `url` att ange, och ett schema som pekar på localhost är sämre än inget —
 * samma hållning som `sitemap.ts` och `robots.ts` har.
 */

/**
 * Gör objektet säkert att lägga inuti en `<script>`.
 *
 * `</script>` i en sträng skulle annars avsluta taggen och släppa ut resten
 * som HTML. Datan här är vår egen, men regeln ska stå i koden och inte i
 * huvudet på den som nästa gång lägger till ett fält som kommer utifrån.
 */
function serialize(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function StructuredData({
  pricing,
  modules,
}: {
  pricing: ScreenPricing;
  modules: ModulePricing;
}) {
  const base = siteUrl();
  if (!base) return null;

  const organization = {
    "@type": "Organization",
    "@id": `${base}/#organisation`,
    name: "TERAFALK AB",
    url: `${base}/`,
    logo: `${base}/icon-512.png`,
    email: "support@tikkr.se",
    address: { "@type": "PostalAddress", addressCountry: "SE" },
  };

  const application = {
    "@type": "SoftwareApplication",
    name: "Tikkr",
    url: `${base}/`,
    applicationCategory: "BusinessApplication",
    // Ingen installation: skärmen är en pekskärm med webbläsare.
    operatingSystem: "Web",
    inLanguage: "sv-SE",
    publisher: { "@id": organization["@id"] },
    offers: {
      "@type": "Offer",
      // Priset per skärm och månad, exklusive moms. Kommer från artikeln hos
      // betaltjänsten, så en prisändring där syns här utan driftsättning.
      price: pricing.month,
      priceCurrency: "SEK",
      category: "subscription",
      availability: "https://schema.org/InStock",
      description: `${pricing.month} kr per stämplingsskärm och månad, exklusive moms. Tillvalet Löneunderlag ${modules.PAYROLL.month} kr per månad och företag.`,
    },
  };

  const faq = {
    "@type": "FAQPage",
    mainEntity: faqQuestions(modules).map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Innehållet är serialiserat av `serialize` ovan, som tar hand om
      // tecknet som annars kan bryta sig ur taggen.
      dangerouslySetInnerHTML={{
        __html: serialize({
          "@context": "https://schema.org",
          "@graph": [organization, application, faq],
        }),
      }}
    />
  );
}
