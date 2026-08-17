import type { EmailMessage } from "./email";

/**
 * MEJLEN SYSTEMET SKICKAR.
 *
 * Texterna ligger samlade här och inte utspridda där de skickas, av samma skäl
 * som resten av gränssnittet: en genomgång av vad kunden faktiskt läser ska gå
 * att göra på ett ställe.
 *
 * Tre regler för utformningen:
 *
 * 1. **Ren text först.** Ett mejl som bara finns som HTML ser trasigt ut i
 *    klienter som visar text, och behandlas hårdare av skräppostfilter.
 * 2. **Adressen i klartext.** Länken skrivs ut som den är, inte gömd bakom
 *    "klicka här". Mottagaren ska kunna se vart den går innan de klickar —
 *    och ett mejl om lösenord är precis det nätfiske brukar imitera.
 * 3. **Avsändaren är namngiven.** Tikkr, och därunder att tjänsten kommer från
 *    TERAFALK AB. Ett automatmejl utan avsändare ser ut som skräppost.
 */

const FROM_NAME = "Tikkr";

/** Står sist i varje utskick. */
const SIGNATURE = [
  "—",
  `${FROM_NAME} — tidregistrering per order`,
  "En tjänst från TERAFALK AB",
].join("\n");

function compose(parts: {
  to: string;
  subject: string;
  lines: string[];
}): EmailMessage {
  return {
    to: parts.to,
    subject: parts.subject,
    text: [...parts.lines, "", SIGNATURE].join("\n"),
  };
}

/**
 * Länken för att sätta ett nytt lösenord.
 *
 * Texten säger uttryckligen vad som händer om man INTE bad om mejlet. Den som
 * får ett oväntat återställningsmejl ska förstå att kontot inte är i fara och
 * att ingen åtgärd krävs — annars blir varje sådant mejl ett supportärende.
 */
export function passwordResetEmail(params: {
  to: string;
  link: string;
  minutesValid: number;
}): EmailMessage {
  return compose({
    to: params.to,
    subject: "Återställ ditt lösenord till Tikkr",
    lines: [
      "Någon har begärt ett nytt lösenord till kontot som hör till den här",
      "adressen. Öppna länken nedan för att välja ett nytt:",
      "",
      params.link,
      "",
      `Länken gäller i ${params.minutesValid} minuter och kan användas en gång.`,
      "",
      "Har du inte begärt något nytt lösenord behöver du inte göra någonting.",
      "Ditt nuvarande lösenord fortsätter att gälla, och ingen kan komma åt",
      "kontot utan länken ovan.",
    ],
  });
}

/** Inbjudan till en ny administratör. */
export function adminInviteEmail(params: {
  to: string;
  link: string;
  companyName: string;
  invitedByEmail: string;
  daysValid: number;
}): EmailMessage {
  return compose({
    to: params.to,
    subject: `Du har bjudits in till ${params.companyName} i Tikkr`,
    lines: [
      `${params.invitedByEmail} har bjudit in dig som administratör för`,
      `${params.companyName} i Tikkr, där arbetstid registreras per order och`,
      "arbetsmoment.",
      "",
      "Öppna länken nedan för att välja ett lösenord och komma igång:",
      "",
      params.link,
      "",
      `Länken gäller i ${params.daysValid} dagar och kan användas en gång.`,
      "",
      "Känner du inte igen avsändaren kan du bortse från det här mejlet. Inget",
      "konto skapas förrän länken används.",
    ],
  });
}

/**
 * Bekräftelse på att lösenordet ändrats.
 *
 * Skickas EFTER bytet, och är den enda signal en person får om någon annan
 * bytt lösenord på deras konto. Utan den kan ett övertaget konto passera
 * obemärkt.
 */
export function passwordChangedEmail(params: { to: string }): EmailMessage {
  return compose({
    to: params.to,
    subject: "Ditt lösenord till Tikkr har ändrats",
    lines: [
      "Lösenordet till ditt Tikkr-konto har just ändrats. Alla enheter som var",
      "inloggade har loggats ut.",
      "",
      "Var det inte du som gjorde det — svara på det här mejlet omgående, så",
      "hjälper vi dig att säkra kontot.",
    ],
  });
}
