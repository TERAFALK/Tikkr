import type { CompanyDb } from "./tenant";
import { buildPayrollPeriod, type PayrollPeriod } from "./payroll";
import { atfEarnedMinutes, findAgreement, workFormFor } from "./collective-agreements";
import { addDaysInZone, wallTimeIn } from "./time-zone";

/**
 * ARBETSTIDSFÖRKORTNING — UNDERLAG, ALDRIG SALDO (tillagt 2026-10-13).
 *
 * Kundens formel, för en kalendermånad:
 *
 *   ATF-underlag = planerad tid (månaden)
 *                + flex (föregående månad)
 *                − ogiltig frånvaro (månaden)
 *
 *   intjänad ATF = underlag × avtalets minuter per heltidsvecka
 *                            ÷ heltidsveckans minuter
 *
 * För Teknikavtalet IF Metall på dagtid är faktorn 82 ÷ 2 400 = 0,03417,
 * det kunden skrivit som 0,0342.
 *
 * FLEXEN ÄR FÖREGÅENDE MÅNADS, och det är kundens val. Deras lönekörning
 * räknar ATF innan månaden är slut, då den senaste kända flexen är förra
 * månadens. Det är MÅNADENS flex, aldrig saldot: saldot hade räknat samma
 * timmar en gång till varje månad de stod kvar.
 *
 * OGILTIG FRÅNVARO är frånvaro på en orsak som varken ger ATF (kundens kryss,
 * `AbsenceReason.givesAtf`) eller drar på flexen. Flexledighet syns redan i
 * flexen som minus, och hade den dragits här också hade samma timmar tagits
 * bort två gånger.
 *
 * Frånvaro före startdatumet dras inte: där finns ingen planerad tid att dra
 * den från.
 *
 * TIMANSTÄLLD har varken planerad tid eller flex, och formeln hade gett noll.
 * Avtalet ger den som arbetar kortare tid ATF i proportion, så underlaget är i
 * stället arbetad tid och frånvaro som ger ATF. Det är vad formeln räknar
 * fram för en fast anställd också, bara utan förskjutningen av flexen.
 *
 * Bara för en hel kalendermånad, eftersom formeln blandar två månader. För en
 * vecka eller ett godtyckligt intervall finns ingen föregående månad att ta
 * flexen från, och då visas ingen ATF alls hellre än en som är fel.
 *
 * Tikkr håller INGET ATF-saldo. Tidbanken, uttagen och det som vid årsskiftet
 * blir pensionspremie hör till lönesystemet.
 */

export interface AtfBasis {
  agreementName: string;
  workFormLabel: string;
  plannedMinutes: number;
  previousMonthFlexMinutes: number;
  invalidAbsenceMinutes: number;
  /** Underlaget som ATF räknas på. Aldrig negativt. */
  basisMinutes: number;
  earnedMinutes: number;
}

/**
 * Är perioden exakt en kalendermånad, från den första till den sista?
 *
 * Räknas på väggen i företagets tidszon, som allt annat i löneunderlaget.
 */
export function isCalendarMonth(from: Date, to: Date, timeZone: string): boolean {
  const first = wallTimeIn(from, timeZone);
  const next = wallTimeIn(addDaysInZone(to, 1, timeZone), timeZone);

  const followingMonth =
    first.month === 12
      ? next.year === first.year + 1 && next.month === 1
      : next.year === first.year && next.month === first.month + 1;

  return first.day === 1 && next.day === 1 && followingMonth;
}

/**
 * ATF-underlaget för en tidrapport.
 *
 * Null när företaget inte valt något avtal, eller när perioden inte är en hel
 * kalendermånad.
 */
export async function buildAtf(
  db: CompanyDb,
  timeZone: string,
  period: PayrollPeriod,
  agreementKey: string | null
): Promise<AtfBasis | null> {
  const agreement = findAgreement(agreementKey);
  if (!agreement) return null;
  if (!isCalendarMonth(period.from, period.to, timeZone)) return null;

  const form = workFormFor(agreement, period.employee.atfWorkForm);

  const atfAbsence = (counted: (absence: { givesAtf: boolean }) => boolean) =>
    period.days
      .filter((day) => !day.beforeStart)
      .flatMap((day) => day.absences)
      .filter((absence) => !absence.drawsOnFlex && counted(absence))
      .reduce((sum, absence) => sum + absence.minutes, 0);

  if (period.employee.hourly) {
    const basis = period.totals.worked + atfAbsence((absence) => absence.givesAtf);

    return {
      agreementName: agreement.name,
      workFormLabel: form.label,
      plannedMinutes: 0,
      previousMonthFlexMinutes: 0,
      invalidAbsenceMinutes: 0,
      basisMinutes: basis,
      earnedMinutes: atfEarnedMinutes(form, basis),
    };
  }

  // Föregående månad, första till sista dagen.
  const previousEnd = addDaysInZone(period.from, -1, timeZone);
  const previousStart = addDaysInZone(
    previousEnd,
    -(wallTimeIn(previousEnd, timeZone).day - 1),
    timeZone
  );

  const previous = await buildPayrollPeriod(
    db,
    timeZone,
    period.employee.id,
    previousStart,
    previousEnd
  );

  const previousMonthFlexMinutes = previous?.totals.flex ?? 0;
  const invalidAbsenceMinutes = atfAbsence((absence) => !absence.givesAtf);

  const basis = Math.max(
    0,
    period.totals.planned + previousMonthFlexMinutes - invalidAbsenceMinutes
  );

  return {
    agreementName: agreement.name,
    workFormLabel: form.label,
    plannedMinutes: period.totals.planned,
    previousMonthFlexMinutes,
    invalidAbsenceMinutes,
    basisMinutes: basis,
    earnedMinutes: atfEarnedMinutes(form, basis),
  };
}
