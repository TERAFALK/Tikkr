/**
 * KOLLEKTIVAVTALEN SOM ATF RÄKNAS EFTER (tillagt 2026-10-13).
 *
 * Arbetstidsförkortningen tjänas in olika i olika avtal, och olika inom samma
 * avtal beroende på arbetstidsform. Tikkr räknar fram hur mycket som tjänats
 * in som UNDERLAG till lönen, aldrig ett saldo: tidbanken, uttagen och det som
 * vid årsskiftet blir pensionspremie hör till lönesystemet. Se atf.ts.
 *
 * VÄRDENA ÄR AVTALETS, INTE VÅRA. Varje rad bär sin källa och sin
 * giltighetstid. Ändras avtalet ändras raden här, i en egen PR, så att
 * ändringen syns i en granskning och har ett datum. Ett tal som någon skrivit
 * in i en ruta har ingen källa alls.
 *
 * Intjänandet uttrycks som minuter per FULLGJORD heltidsvecka, så som avtalen
 * själva skriver det. Per timme blir det minuterna delat med veckans timmar:
 * 82 minuter på 40 timmar är 0,03417 per timme, det som kunden räknat som
 * 0,0342. Den som arbetat kortare tid får i proportion till det.
 *
 * Filen har inga importer och ska inte få några. Den läses av lönesidan och av
 * inställningarna, och ett beroende hit drar inte med sig något annat.
 */

export interface AtfWorkForm {
  key: string;
  /** Som formen heter i avtalet och i panelen. */
  label: string;
  /** Minuter till tidbanken för en fullgjord heltidsvecka. */
  minutesPerWeek: number;
  /** Ordinarie veckoarbetstid för heltid i formen. */
  fullTimeHoursPerWeek: number;
}

export interface CollectiveAgreement {
  key: string;
  name: string;
  /** Var värdena står, så att nästa person kan kontrollera dem. */
  source: string;
  /** Avtalsperioden värdena gäller för, "ÅÅÅÅ-MM-DD". */
  validFrom: string;
  validTo: string;
  /** Formen som gäller när ingen är vald på personen. */
  defaultForm: string;
  forms: AtfWorkForm[];
}

export const COLLECTIVE_AGREEMENTS: CollectiveAgreement[] = [
  {
    key: "TEKNIK_IF_METALL",
    name: "Teknikavtalet IF Metall",
    source: "Teknikavtalet IF Metall 2025–2027, § 4 mom 3:2 och 3:3",
    validFrom: "2025-04-01",
    validTo: "2027-03-31",
    defaultForm: "DAY",
    forms: [
      { key: "DAY", label: "Dagtid", minutesPerWeek: 82, fullTimeHoursPerWeek: 40 },
      { key: "TWO_SHIFT", label: "Tvåskift", minutesPerWeek: 202, fullTimeHoursPerWeek: 40 },
      {
        key: "THREE_SHIFT_INTERMITTENT",
        label: "Intermittent treskift",
        minutesPerWeek: 82,
        fullTimeHoursPerWeek: 38,
      },
      {
        key: "THREE_SHIFT_CONTINUOUS",
        label: "Kontinuerligt treskift",
        minutesPerWeek: 82,
        fullTimeHoursPerWeek: 36,
      },
      {
        key: "THREE_SHIFT_CONTINUOUS_HOLIDAYS",
        label: "Kontinuerligt treskift med storhelgsdrift",
        minutesPerWeek: 82,
        fullTimeHoursPerWeek: 35,
      },
      { key: "NIGHT", label: "Ständig natt", minutesPerWeek: 82, fullTimeHoursPerWeek: 34 },
    ],
  },
];

export function findAgreement(key: string | null | undefined): CollectiveAgreement | null {
  if (!key) return null;
  return COLLECTIVE_AGREEMENTS.find((agreement) => agreement.key === key) ?? null;
}

/**
 * Personens arbetstidsform i avtalet. En form som inte finns i avtalet, till
 * exempel efter ett byte av avtal, ger avtalets förval i stället för ingenting.
 */
export function workFormFor(
  agreement: CollectiveAgreement,
  formKey: string | null | undefined
): AtfWorkForm {
  return (
    agreement.forms.find((form) => form.key === formKey) ??
    agreement.forms.find((form) => form.key === agreement.defaultForm)!
  );
}

/** ATF som tjänas in på ett antal minuters underlag, i hela minuter. */
export function atfEarnedMinutes(form: AtfWorkForm, basisMinutes: number): number {
  if (basisMinutes <= 0) return 0;
  return Math.round((basisMinutes * form.minutesPerWeek) / (form.fullTimeHoursPerWeek * 60));
}
