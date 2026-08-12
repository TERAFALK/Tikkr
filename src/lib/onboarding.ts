import type { CompanyDb } from "./tenant";

/**
 * KOM IGÅNG-GUIDEN.
 *
 * Vilka steg som är klara räknas ut ur databasen varje gång, istället för att
 * sparas som en flagga. Två skäl:
 *
 * 1. En flagga kan bli osann. Raderar kunden sin sista order är guiden inte
 *    längre klar, men flaggan skulle påstå det.
 * 2. Ingen kolumn att hålla i takt, och inget steg som kan bli "klart" utan
 *    att något faktiskt gjorts.
 */

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  /** true när allt som krävs för att kunna stämpla är på plats. */
  ready: boolean;
}

export async function getOnboardingState(
  db: CompanyDb
): Promise<OnboardingState> {
  const [employees, moments, orders, devices] = await Promise.all([
    db.employee.count({ where: { active: true } }),
    db.workMoment.count({ where: { active: true } }),
    db.order.count({ where: { status: "OPEN" } }),
    db.kioskDevice.count({ where: { active: true } }),
  ]);

  // Ordningen speglar beroendena: utan anställda finns ingen att stämpla,
  // utan order och moment går det inte att stämpla in, och skärmen är sist
  // eftersom den inte visar något förrän det andra finns.
  const steps: OnboardingStep[] = [
    {
      key: "employees",
      title: "Lägg upp anställda",
      description:
        "Namnen visas som knappar på stämplingsskärmen. Använd den form personerna känns igen på.",
      href: "/admin/kom-igang",
      done: employees > 0,
    },
    {
      key: "moments",
      title: "Lägg upp arbetsmoment",
      description:
        "Den typ av arbete tiden avser, exempelvis svetsning, montering eller lackering. En kort lista rekommenderas.",
      href: "/admin/kom-igang",
      done: moments > 0,
    },
    {
      key: "orders",
      title: "Lägg upp minst en order",
      description:
        "All registrerad tid hör till en kundorder. Minst en öppen order krävs för att kunna stämpla in.",
      href: "/admin/kom-igang",
      done: orders > 0,
    },
    {
      key: "device",
      title: "Koppla en stämplingsskärm",
      description:
        "Skapa skärmen och öppna dess kopplingslänk en gång på den enhet som ska användas för stämpling.",
      href: "/admin/skarmar",
      done: devices > 0,
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    completed,
    total: steps.length,
    ready: completed === steps.length,
  };
}

/**
 * Förslag som kunden kan klicka in istället för att skriva.
 *
 * Ett tomt fält är den vanligaste platsen för folk att ge upp. Förslagen är
 * vanliga moment i svensk verkstadsindustri och går att ta bort efteråt.
 */
export const SUGGESTED_MOMENTS = [
  "Svetsning",
  "Fräsning",
  "Svarvning",
  "Montering",
  "Lackering",
  "Kapning",
  "Slipning",
  "Kvalitetskontroll",
];
