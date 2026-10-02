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
 *
 * STEGEN RÄKNAR ALLT SOM FINNS, inte bara det som är aktivt just nu (ändrat
 * 2026-09-29). Frågan var tidigare "finns det en ÖPPEN order", och den dagen
 * kunden levererat allt de hade sa guiden att uppsättningen var ogjord: en
 * markerad ruta på översikten och ett extra avsnitt i menyn, hos en kund som
 * kört systemet i månader. Samma sak hade hänt när den sista anställda som
 * slutat avaktiverades. Steget svarar på om kunden KAN lägga upp en order, och det
 * har de bevisat den dag de gjort det en gång.
 *
 * TVÅ GRUPPER, OCH BARA DEN FÖRSTA AVGÖR OM GUIDEN ÄR KLAR (ändrat
 * 2026-09-29). Systemet har vuxit med kundregister, timkostnader, improduktiv
 * tid och ett löneunderlag, och guiden stod kvar vid de fyra steg som fanns
 * första veckan.
 *
 *   `steps`  är vad som KRÄVS för att kunna stämpla. Utan dem visar
 *            stämplingsskärmen ingenting att trycka på.
 *   `extras` är vad som gör UNDERLAGEN kompletta. Man kan stämpla utan dem,
 *            men fakturan eller tidrapporten blir sämre.
 *
 * Gränsen är avsiktlig. Blandades de ihop skulle `ready` betyda "har fyllt i
 * allt", och den dag en kund inte vill ha ett kundregister vore guiden aldrig
 * klar. `ready` betyder en sak: skärmen går att använda.
 */

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Texten på knappen som leder vidare. Bara för de rekommenderade stegen. */
  action?: string;
}

export interface OnboardingState {
  /** Stegen som krävs för att kunna stämpla. */
  steps: OnboardingStep[];
  /** Stegen som gör underlagen kompletta. Påverkar inte `ready`. */
  extras: OnboardingStep[];
  completed: number;
  total: number;
  /** true när allt som krävs för att kunna stämpla är på plats. */
  ready: boolean;
}

export async function getOnboardingState(
  db: CompanyDb,
  options: {
    /**
     * true när företaget har löneunderlaget. Styr om arbetstidsschemat
     * räknas som ett steg alls.
     *
     * Skickas in i stället för att slås upp här. Anroparen vet redan om
     * modulen är på, och en funktion i lib/ ska inte behöva känna till
     * grinden för att kunna räkna fyra siffror. Se lib/company-modules.ts.
     */
    payroll?: boolean;
  } = {}
): Promise<OnboardingState> {
  const [
    employees,
    moments,
    orders,
    devices,
    customers,
    momentsWithRate,
    indirect,
    scheduleDays,
  ] = await Promise.all([
    db.employee.count(),
    db.workMoment.count(),
    db.order.count(),
    db.kioskDevice.count(),
    db.customer.count(),
    db.workMoment.count({ where: { costRateOre: { not: null } } }),
    db.indirectMoment.count(),
    // Bara företagets standardschema. Ett personligt schema hör till en
    // enskild anställd och säger ingenting om att uppsättningen är gjord.
    options.payroll
      ? db.scheduleDay.count({ where: { schedule: { isDefault: true } } })
      : Promise.resolve(0),
  ]);

  // Ordningen speglar beroendena: utan anställda finns ingen att stämpla,
  // utan order och moment går det inte att stämpla in, och skärmen är sist
  // eftersom den inte visar något förrän det andra finns.
  const steps: OnboardingStep[] = [
    {
      key: "employees",
      title: "Lägg upp anställda",
      description: "Visas som knappar på stämplingsskärmen.",
      href: "/admin/kom-igang",
      done: employees > 0,
    },
    {
      key: "moments",
      title: "Lägg upp arbetsmoment",
      description:
        "Den typ av arbete tiden avser, t.ex. svetsning eller montering.",
      href: "/admin/kom-igang",
      done: moments > 0,
    },
    {
      key: "orders",
      title: "Lägg upp minst en order",
      description: "All registrerad tid hör till en kundorder.",
      href: "/admin/kom-igang",
      done: orders > 0,
    },
    {
      key: "device",
      title: "Koppla en stämplingsskärm",
      description: "Lägg upp skärmen och knappa in koden på enheten.",
      href: "/admin/skarmar",
      done: devices > 0,
    },
  ];

  const extras: OnboardingStep[] = [
    {
      key: "customers",
      title: "Lägg upp kunder",
      description:
        "Ordern kopplas till en kund. Kunden bär påslag, rabatt och adressen på underlaget.",
      href: "/admin/kunder",
      action: "Till kunder",
      done: customers > 0,
    },
    {
      key: "rates",
      title: "Sätt timkostnad på arbetsmomenten",
      description:
        "Utan den saknar efterkalkylen underlag och tiden redovisas utan belopp.",
      href: "/admin/moment",
      action: "Till arbetsmoment",
      done: momentsWithRate > 0,
    },
    {
      key: "indirect",
      title: "Lägg upp improduktiv tid",
      description:
        "Städning, möten och underhåll. Registreras skilt från ordrarna och faktureras aldrig.",
      href: "/admin/improduktivt",
      action: "Till improduktiv tid",
      done: indirect > 0,
    },
  ];

  if (options.payroll) {
    extras.push({
      key: "schedule",
      title: "Lägg upp arbetstidsschemat",
      description:
        "Ger den planerade tiden som flexsaldot mäts mot. Utan schema blir all arbetad tid flex.",
      href: "/admin/installningar/schema",
      action: "Till arbetstider",
      done: scheduleDays > 0,
    });
  }

  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    extras,
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
