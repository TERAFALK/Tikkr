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
 *
 * DE REKOMMENDERADE STEGEN FÖLJER TILLVALEN (ändrat 2026-11-27). Guiden
 * visade bara arbetstidsschemat för löneunderlaget, under ett namn sidan inte
 * längre har, och ingenting alls för planeringen. Nu står varje tillval under
 * sin egen rubrik, och bara för den som har det.
 */

/**
 * Var ett rekommenderat steg hör hemma: hos alla, eller med ett tillval. Guiden
 * visar varje grupp under sin egen rubrik, så att den som har löneunderlaget
 * ser vad som hör till det, och den som inte har det aldrig ser stegen.
 */
export type OnboardingGroup = "base" | "payroll" | "planning";

export interface OnboardingStep {
  key: string;
  title: string;
  /** Står under rubriken i guiden. Ett ställe, inte två. */
  description: string;
  href: string;
  done: boolean;
  /** Texten på knappen som leder vidare. Bara för de rekommenderade stegen. */
  action?: string;
  /** Bara för de rekommenderade stegen. */
  group?: OnboardingGroup;
}

export interface OnboardingState {
  /** Stegen som krävs för att kunna stämpla. */
  steps: OnboardingStep[];
  /**
   * Stegen som gör underlagen kompletta. Påverkar inte `ready`. Tom utan
   * `extras: true`, se nedan.
   */
  extras: OnboardingStep[];
  completed: number;
  total: number;
  /** true när allt som krävs för att kunna stämpla är på plats. */
  ready: boolean;
}

export interface OnboardingOptions {
  /**
   * true räknar också de rekommenderade stegen. Bara guiden visar dem.
   * Panelens layout och översikten behöver fyra siffror och `ready`, vid
   * varje sidladdning, och där ska inte ett tiotal frågor till köras för en
   * lista ingen ser.
   */
  extras?: boolean;
  /**
   * Tillvalen och planeringsläget. Skickas in i stället för att slås upp
   * här: anroparen vet redan om modulen är på, och en funktion i lib/ ska
   * inte behöva känna till grinden. Se lib/company-modules.ts.
   */
  payroll?: boolean;
  planning?: boolean;
  planningMode?: "PRODUCTION" | "SERVICE";
  /** Företagets avtal för arbetstidsförkortning, eller null. */
  atfAgreement?: string | null;
}

export async function getOnboardingState(
  db: CompanyDb,
  options: OnboardingOptions = {}
): Promise<OnboardingState> {
  const [employees, moments, orders, devices] = await Promise.all([
    db.employee.count(),
    db.workMoment.count(),
    db.order.count(),
    db.kioskDevice.count(),
  ]);

  // Ordningen speglar beroendena: utan anställda finns ingen att stämpla,
  // utan order och moment går det inte att stämpla in, och skärmen är sist
  // eftersom den inte visar något förrän det andra finns.
  const steps: OnboardingStep[] = [
    {
      key: "employees",
      title: "Lägg upp anställda",
      description: "Varje anställd blir en knapp på stämplingsskärmen.",
      href: "/admin/kom-igang",
      done: employees > 0,
    },
    {
      key: "moments",
      title: "Lägg upp arbetsmoment",
      description:
        "Det arbete tiden avser, till exempel svetsning eller montering.",
      href: "/admin/kom-igang",
      done: moments > 0,
    },
    {
      key: "orders",
      title: "Lägg upp minst en order",
      description: "All ordertid stämplas på en order.",
      href: "/admin/kom-igang",
      done: orders > 0,
    },
    {
      key: "device",
      title: "Koppla en stämplingsskärm",
      description: "Lägg upp skärmen här och knappa in koden på skärmen.",
      href: "/admin/installningar/skarmar",
      done: devices > 0,
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    extras: options.extras ? await extrasFor(db, options) : [],
    completed,
    total: steps.length,
    ready: completed === steps.length,
  };
}

/**
 * Det som gör underlagen kompletta, för alla och per tillval.
 *
 * Arbetstiderna hör till arbetsytan sedan 2026-10-17 och visas med
 * löneunderlaget ELLER planeringen, som båda läser dem (WORK_HOURS_MODULES).
 * De står under det första tillvalet kunden har, så att de inte syns två
 * gånger.
 */
async function extrasFor(
  db: CompanyDb,
  options: OnboardingOptions
): Promise<OnboardingStep[]> {
  const workHours = Boolean(options.payroll || options.planning);
  const stations = Boolean(
    options.planning && options.planningMode !== "SERVICE"
  );

  const [
    customers,
    employeeRates,
    momentRates,
    indirect,
    admins,
    profile,
    scheduleDays,
    holidays,
    breakTypes,
    stationCount,
  ] = await Promise.all([
    db.customer.count(),
    db.employee.count({ where: { costRateOre: { not: null } } }),
    db.workMoment.count({ where: { costRateOre: { not: null } } }),
    db.indirectMoment.count(),
    db.adminUser.count(),
    db.companyProfile.count({ where: { orgNumber: { not: null } } }),
    // Bara företagets tider. En anställds egna tider säger ingenting om att
    // uppsättningen är gjord.
    workHours
      ? db.scheduleDay.count({ where: { schedule: { isDefault: true } } })
      : Promise.resolve(0),
    options.payroll ? db.holiday.count() : Promise.resolve(0),
    options.payroll ? db.breakType.count() : Promise.resolve(0),
    stations ? db.station.count() : Promise.resolve(0),
  ]);

  const workHoursStep: OnboardingStep = {
    key: "work-hours",
    title: "Lägg upp arbetstiderna",
    description: options.payroll
      ? "Den planerade tiden flexen mäts mot. Utan arbetstider blir all arbetad tid flex."
      : "Visar på tavlan när personalen arbetar.",
    href: "/admin/installningar/arbetstider",
    action: "Till arbetstider",
    done: scheduleDays > 0,
  };

  const extras: OnboardingStep[] = [
    {
      key: "customers",
      title: "Lägg upp kunder",
      description:
        "Ordern kopplas till en kund, som bär påslag, rabatt och adressen på underlaget.",
      href: "/admin/kunder",
      action: "Till kunder",
      done: customers > 0,
      group: "base",
    },
    {
      // Självkostnaden är personens sats plus momentets (CLAUDE.md § 3
      // regel 4). Steget är klart när någon av dem finns, eftersom en sats
      // ensam räcker för att efterkalkylen ska ha ett belopp.
      key: "rates",
      title: "Sätt timkostnad",
      description:
        "På den anställde och på arbetsmomentet. Efterkalkylen lägger ihop dem, och utan någon av dem står tiden utan belopp.",
      href: "/admin/installningar/arbetsmoment",
      action: "Till arbetsmoment",
      done: employeeRates + momentRates > 0,
      group: "base",
    },
    {
      key: "indirect",
      title: "Lägg upp improduktiv tid",
      description:
        "Städning, möten och underhåll. Registreras skilt från ordrarna och faktureras aldrig.",
      href: "/admin/installningar/improduktivt",
      action: "Till improduktiv tid",
      done: indirect > 0,
      group: "base",
    },
    {
      key: "users",
      title: "Bjud in kollegor",
      description: "Var och en loggar in med eget konto.",
      href: "/admin/installningar/anvandare",
      action: "Till användare",
      done: admins > 1,
      group: "base",
    },
    {
      key: "company",
      title: "Fyll i företagsuppgifterna",
      description:
        "Organisationsnummer och adresser, till beställningar och fakturor.",
      href: "/admin/installningar",
      action: "Till företaget",
      done: profile > 0,
      group: "base",
    },
  ];

  if (options.payroll) {
    extras.push(
      { ...workHoursStep, group: "payroll" },
      {
        key: "holidays",
        title: "Lägg in röda dagar",
        description:
          "Dagar utan planerad tid för någon. Listan fylls i för varje år.",
        href: "/admin/installningar/roda-dagar",
        action: "Till röda dagar",
        done: holidays > 0,
        group: "payroll",
      },
      {
        key: "breaks",
        title: "Lägg upp rasttyper",
        description: "Rasterna stämplas på skärmen och dras från närvarotiden.",
        href: "/admin/installningar/schema",
        action: "Till rasttyper",
        done: breakTypes > 0,
        group: "payroll",
      },
      {
        key: "atf",
        title: "Välj avtal för arbetstidsförkortning",
        description: "Bara om ert kollektivavtal ger arbetstidsförkortning.",
        href: "/admin/installningar/atf",
        action: "Till arbetstidsförkortning",
        done: Boolean(options.atfAgreement),
        group: "payroll",
      }
    );
  }

  if (options.planning) {
    if (!options.payroll) extras.push({ ...workHoursStep, group: "planning" });

    if (stations) {
      extras.push({
        key: "stations",
        title: "Lägg upp stationer",
        description: "En maskin eller arbetsplats som kör ett arbetsmoment.",
        href: "/admin/installningar/stationer",
        action: "Till stationer",
        done: stationCount > 0,
        group: "planning",
      });
    }
  }

  return extras;
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
