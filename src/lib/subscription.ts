/**
 * VAD SOM HÄNDER NÄR BETALNINGEN UTEBLIR.
 *
 * Grundregeln: **stämplingen slutar aldrig fungera.**
 *
 * Skälet är inte generositet. Stämplar ingen går arbetstid förlorad, och den
 * går inte att rekonstruera i efterhand — svetsaren minns inte på fredagen
 * vilka ordrar hen rörde på tisdagen. Den tiden är kundens fakturaunderlag mot
 * SIN kund, alltså pengar som försvinner för någon som inte rår över att en
 * faktura till oss är obetald.
 *
 * Istället låses adminpanelen, där rapporter och export finns. Kunden kan
 * fortsätta samla in tid men inte hämta ut den. Trycket hamnar på den som kan
 * betala, och en stor varning på stämplingsskärmen ser till att någon frågar
 * chefen.
 *
 * Ren logik utan databas eller webb, så reglerna går att testa i detalj.
 */

export type AccessLevel = "full" | "warning" | "locked";

export interface SubscriptionFacts {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
}

export interface AccessState {
  level: AccessLevel;
  /** Kort rubrik, visas på stämplingsskärmen. */
  headline: string;
  /** Förklaring för administratören. */
  detail: string;
  /** Dagar kvar innan panelen låses. Saknas när det inte är aktuellt. */
  daysLeft?: number;
}

/** Provperioden varnar under sista veckan. */
const TRIAL_WARNING_DAYS = 7;

/**
 * Respit vid utebliven betalning.
 *
 * Stripe gör flera betalförsök under ungefär två veckor. Att låsa panelen
 * direkt vid det första misslyckade försöket skulle straffa kunder vars kort
 * bara gått ut.
 */
const PAST_DUE_GRACE_DAYS = 10;

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY);
}

export function evaluateAccess(
  facts: SubscriptionFacts,
  now: Date = new Date()
): AccessState {
  switch (facts.status) {
    case "ACTIVE":
      return {
        level: "full",
        headline: "",
        detail: "Prenumerationen är aktiv.",
      };

    case "TRIALING": {
      // Saknas slutdatum har provperioden aldrig satts — t.ex. för företag
      // som lagts upp för hand. Vi låser inte ute någon på grund av det.
      if (!facts.trialEndsAt) {
        return { level: "full", headline: "", detail: "Provperiod pågår." };
      }

      const left = daysBetween(now, facts.trialEndsAt);

      if (left <= 0) {
        return {
          level: "locked",
          headline: "Provperioden har tagit slut",
          detail:
            "Rapporter och export är låsta tills en prenumeration startats. " +
            "Stämplingsskärmarna är opåverkade och all tid fortsätter registreras.",
          daysLeft: 0,
        };
      }

      if (left <= TRIAL_WARNING_DAYS) {
        return {
          level: "warning",
          headline: `Provperioden tar slut om ${left} ${left === 1 ? "dag" : "dagar"}`,
          detail:
            "Starta prenumerationen för att behålla tillgången till rapporter " +
            "och export. Stämplingsskärmarna påverkas inte.",
          daysLeft: left,
        };
      }

      return {
        level: "full",
        headline: "",
        detail: `Provperiod, ${left} dagar kvar.`,
        daysLeft: left,
      };
    }

    case "PAST_DUE": {
      const since = facts.pastDueSince ?? now;
      const left = PAST_DUE_GRACE_DAYS - daysBetween(since, now);

      if (left <= 0) {
        return {
          level: "locked",
          headline: "Betalningen har inte gått igenom",
          detail:
            "Rapporter och export är låsta tills betalningen genomförts. " +
            "Stämplingsskärmarna är opåverkade och all tid fortsätter registreras.",
          daysLeft: 0,
        };
      }

      return {
        level: "warning",
        headline: "Betalningen har inte gått igenom",
        detail:
          `Uppdatera betalsättet inom ${left} ${left === 1 ? "dag" : "dagar"}, ` +
          `annars låses rapporter och export.`,
        daysLeft: left,
      };
    }

    case "CANCELED":
      return {
        level: "locked",
        headline: "Prenumerationen är avslutad",
        detail:
          "Rapporter och export är låsta. Stämplingsskärmarna är opåverkade " +
          "och all tid fortsätter registreras.",
        daysLeft: 0,
      };
  }
}

/** Provperiodens längd vid registrering. */
export const TRIAL_DAYS = 30;

export function trialEndDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY);
}
