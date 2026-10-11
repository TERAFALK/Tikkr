import type { GuideSlug } from "./guides";

/**
 * VANLIGA FRÅGOR I HJÄLPCENTRET.
 *
 * Inte säljsidans frågor. De svarar på om Tikkr passar, de här på hur något
 * fungerar för den som redan använder det. Varje svar är kort och pekar på
 * guiden som har resten, så att samma sak inte beskrivs på två ställen som
 * hinner sluta säga samma sak.
 */

export interface HelpFaq {
  q: string;
  a: string;
  guide: GuideSlug;
}

export const HELP_FAQ: HelpFaq[] = [
  {
    q: "Någon glömde stämpla ut. Vad händer?",
    a: "Stämplingen stängs vid klockslaget under Inställningar, Tid och automatik, och hamnar i granskningen. Rätta sluttiden där.",
    guide: "granskning",
  },
  {
    q: "Stämplingsskärmen visar inga namn.",
    a: "Skärmen är inte kopplad, eller så finns inga aktiva anställda. Kontrollera under Stämplingsskärmar att skärmen står som Kopplad.",
    guide: "koppla-skarm",
  },
  {
    q: "Ordern finns inte på stämplingsskärmen.",
    a: "Ordern är stängd eller inte upplagd. En stängd order öppnas igen under Ordrar. Saknas den helt går det att stämpla på ett snabbjobb.",
    guide: "snabbjobb",
  },
  {
    q: "Kan en stämpling tas bort?",
    a: "Nej. En felaktig stämpling rättas genom att skrivas om, så att det syns vem som ändrade vad.",
    guide: "andra-stampling",
  },
  {
    q: "Varför skiljer sig tiden på underlaget från tidrapporten?",
    a: "Underlaget räknar maskintid per order. Tidrapporten räknar hur länge personen var på plats. Kör någon två maskiner i fyra timmar blir det åtta timmar på underlagen och fyra i tidrapporten.",
    guide: "tva-maskiner",
  },
  {
    q: "Jag har bytt telefon och kommer inte in.",
    a: "Be en ägare i arbetsytan nollställa tvåstegsverifieringen under Inställningar, Användare. Är du själv ägare, kontakta support.",
    guide: "tvastegsinloggning",
  },
  {
    q: "Vad händer om fakturan till Tikkr inte är betald?",
    a: "Stämplingsskärmarna fortsätter att fungera. Panelen låses efter tio dagar och öppnas igen när fakturan är betald.",
    guide: "prenumeration",
  },
];
