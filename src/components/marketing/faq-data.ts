import type { ModulePricing } from "@/lib/stripe";

/**
 * FRÅGORNA OCH SVAREN, SKILDA FRÅN AVSNITTET SOM RITAR DEM.
 *
 * Två läsare: `Faq` i `Sections.tsx` och den strukturerade datan i
 * `StructuredData.tsx`. Låg listan kvar inne i komponenten hade markupen
 * behövt en egen kopia, och två listor som ska säga samma sak hinner alltid
 * sluta göra det — samma skäl som att orderns beräkning aldrig lagras vid
 * sidan av sina rader, se CLAUDE.md § 3 regel 6.
 *
 * En funktion och inte en konstant: ett av svaren innehåller priset på
 * löneunderlaget, och det hämtas från betaltjänsten vid varje sidvisning.
 */

export interface FaqItem {
  q: string;
  a: string;
}

/** Belopp i svensk form. Samma formatering som i produkten. */
function kr(amount: number): string {
  return amount.toLocaleString("sv-SE");
}

export function faqQuestions(modules: ModulePricing): FaqItem[] {
  return [
    {
      q: "Vilken utrustning krävs i verkstaden?",
      a: "En pekskärm eller surfplatta med webbläsare. Ingen installation krävs. Skärmen kopplas en gång med en sexsiffrig kod och kräver därefter ingen inloggning.",
    },
    {
      q: "Hur lång tid tar uppsättningen?",
      a: "Cirka femton minuter. Anställda, arbetsmoment och ordrar läggs upp i en guide, och skärmen kopplas genom att koden anges på den enhet som ska användas.",
    },
    {
      q: "Kan en anställd arbeta med två maskiner samtidigt?",
      a: "Ja. En anställd kan ha ett pågående jobb per arbetsmoment, men inte två på samma. Pågår två maskiner en timme registreras två maskintimmar, fördelade på respektive order.",
    },
    {
      q: "Vad händer om någon glömmer att stämpla ut?",
      a: "Posten stängs vid ett klockslag ni anger, exempelvis 18:00, och hamnar i granskningen. Den beräknade sluttiden är märkt som beräknad och rättas före fakturering.",
    },
    {
      q: "Vad händer vid avbrott i internetanslutningen?",
      a: "Skärmen tar emot registreringar som vanligt. De sparas lokalt och skickas när anslutningen återupprättats. Arbetstid som inte registrerats går inte att rekonstruera i efterhand.",
    },
    {
      q: "Kan Tikkr användas för löneunderlag?",
      a: `Ja, som tillval för ${kr(modules.PAYROLL.month)} kr per månad: arbetstidsschema, stämplade raster, flex, komp, frånvaro och tidrapport per anställd. Tikkr redovisar timmar. Lönearter, OB och övertidsersättning regleras i kollektivavtal och hanteras i lönesystemet.`,
    },
    {
      q: "Hur hanteras tid som inte ska faktureras?",
      a: "Städning, möten och underhåll registreras som improduktiv tid i ett eget register, skilt från ordrarna.",
    },
    {
      q: "Kan underlaget skickas vidare till vår kund?",
      a: "Ja. Underlaget innehåller er logotyp, ordernummer och kund som rubrik, samtliga stämplingar och en summa sist. Självkostnad och marginal redovisas enbart i efterkalkylen, som är märkt som internt underlag.",
    },
    {
      q: "Var lagras uppgifterna?",
      a: "På servrar i Sverige. Personuppgiftsbiträdesavtal ingår och kan läsas innan ni börjar. Uppgifterna om en anställd omfattar namn, valfritt anställningsnummer och registrerad tid, och kan exporteras eller raderas i panelen.",
    },
    {
      q: "Vad händer vid utebliven betalning?",
      a: "Stämplingsskärmarna fortsätter att fungera. Panelen och exporten låses, eftersom arbetstid som inte registrerats inte går att återskapa. Registrerad tid finns kvar och blir åtkomlig igen när fakturan är betald.",
    },
    {
      q: "Finns det någon bindningstid?",
      a: "Nej. Varken bindningstid eller uppsägningstid. Årsbetalning är ett frivilligt alternativ som ger rabatt.",
    },
  ];
}
