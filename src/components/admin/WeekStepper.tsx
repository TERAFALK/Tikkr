import Link from "next/link";

/**
 * EN VECKA BAKÅT, EN FRAMÅT, OCH VECKONUMRET EMELLAN.
 *
 * Samma reglage på varje sida som räknar i veckor: Rapporter, Stämplingar,
 * Tidrapport och Veckovy.
 *
 * UTSEENDET ÄR PLANERINGENS. Den hade tre fristående knappar långt innan den
 * här komponenten fanns, och den första versionen av den här ritade i stället
 * ett sammanhållet reglage med pilar i svg. Två växlare som gör samma sak men
 * ser olika ut är sämre än den fulare av dem, och planeringens är dessutom
 * den finare: tre lika höga knappar med luft emellan, i samma form som
 * panelens övriga knappar.
 *
 * Numret står i mitten och inte som en rubrik någon annanstans: det är det man
 * läser för att veta var man är, och det hör ihop med pilarna som flyttar en
 * därifrån. Mittenrutan är en etikett och inte en länk, eftersom det inte
 * finns något att trycka på den för.
 */

/** Delas med planeringens växlare. Ändras formen ändras den på båda. */
const stepBase =
  "inline-flex h-8 items-center justify-center rounded-md border " +
  "border-neutral-300 bg-white text-[13px] font-medium";

export default function WeekStepper({
  backHref,
  forwardHref,
  label,
}: {
  backHref: string;
  forwardHref: string;
  /** "Vecka 41", eller "Vecka 41–43" när perioden spänner över flera. */
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={backHref}
        aria-label="Föregående vecka"
        className={`${stepBase} w-8 text-neutral-600 hover:bg-neutral-50`}
      >
        ‹
      </Link>

      <span className={`${stepBase} px-3 whitespace-nowrap text-neutral-700`}>
        {label}
      </span>

      <Link
        href={forwardHref}
        aria-label="Nästa vecka"
        className={`${stepBase} w-8 text-neutral-600 hover:bg-neutral-50`}
      >
        ›
      </Link>
    </div>
  );
}
