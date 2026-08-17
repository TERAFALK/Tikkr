import type { EmailMessage } from "./email";

/**
 * MEJLEN SYSTEMET SKICKAR.
 *
 * Texterna ligger samlade här och inte utspridda där de skickas, av samma skäl
 * som resten av gränssnittet: en genomgång av vad kunden faktiskt läser ska gå
 * att göra på ett ställe.
 *
 * Fyra regler för utformningen:
 *
 * 1. **Textversionen skrivs först.** Den används i labbläget, där mejlen
 *    hamnar i loggen i stället för att skickas, och den fungerar som facit:
 *    går budskapet inte fram utan formatering är mejlet fel skrivet. Notera
 *    att Graph skickar en kroppstyp per mejl — finns HTML är det den som går
 *    ut. Se sendViaGraph i email.ts.
 * 2. **Adressen syns i klartext**, utöver knappen. Mottagaren ska kunna se
 *    vart länken går innan de klickar — ett mejl om lösenord är precis det
 *    som nätfiske imiterar.
 * 3. **Avsändaren är namngiven.** Tikkr, och därunder att tjänsten kommer från
 *    TERAFALK AB. Ett automatmejl utan avsändare ser ut som skräppost.
 * 4. **Inga externa bilder.** De blockeras som standard i de flesta klienter,
 *    och ett mejl vars innehåll försvinner utan bilder är trasigt.
 *
 * HTML-mejl är inte webbsidor. Layouten byggs med tabeller och all CSS ligger
 * inline, eftersom Outlook renderar med Words motor och struntar i det mesta
 * annat — inga flexbox, inga rutnät, inga stilmallar.
 */

/* -------------------------------------------------------------------------- */
/* Utformning                                                                  */
/* -------------------------------------------------------------------------- */

const COLORS = {
  page: "#f4f4f5",
  card: "#ffffff",
  border: "#e5e5e5",
  heading: "#171717",
  body: "#525252",
  muted: "#a3a3a3",
  accent: "#2563eb",
  linkBox: "#fafafa",
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Står sist i textversionen. HTML-versionen har samma sak i sin fot. */
const SIGNATURE_TEXT = [
  "—",
  "Tikkr — tidregistrering per order",
  "En tjänst från TERAFALK AB",
].join("\n");

/**
 * Gör text säker att lägga in i HTML.
 *
 * Företagsnamn och e-postadresser kommer från kunden. Ett namn med ett
 * mindre-än-tecken skulle annars kunna bryta sig ur och ändra mejlets
 * uppbyggnad.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Layout {
  /** Raden som visas som förhandstext i inkorgen. */
  preheader: string;
  heading: string;
  /**
   * Stycken före knappen.
   *
   * Läggs in som HTML utan bearbetning, så att ett ord kan fetas. Allt som
   * kommer från kunden — företagsnamn, adresser — MÅSTE därför köras genom
   * escape() där stycket sätts ihop.
   */
  paragraphs: string[];
  button?: { label: string; href: string };
  /** Stycken efter knappen, i mindre och ljusare text. */
  afterword?: string[];
}

function render(layout: Layout): string {
  const paragraph = (text: string, muted = false) => `
        <p style="margin:0 0 14px;font-family:${FONT};font-size:${
          muted ? "13px" : "15px"
        };line-height:1.6;color:${muted ? COLORS.muted : COLORS.body};">
          ${text}
        </p>`;

  // Knappen byggs som en tabellcell och inte som en länk med utfyllnad.
  // Outlook struntar i utfyllnad på länkar, och knappen skulle då bli en
  // sammanpressad textrad.
  const button = layout.button
    ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;">
          <tr>
            <td align="center" bgcolor="${COLORS.accent}" style="border-radius:8px;">
              <a href="${escape(layout.button.href)}"
                 style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                ${escape(layout.button.label)}
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;color:${COLORS.muted};">
          Fungerar inte knappen — kopiera adressen:
        </p>
        <p style="margin:0 0 18px;padding:10px 12px;background-color:${COLORS.linkBox};border:1px solid ${COLORS.border};border-radius:6px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.body};word-break:break-all;">
          ${escape(layout.button.href)}
        </p>`
    : "";

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(layout.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">

  <!-- Förhandstexten i inkorgslistan. Visas aldrig i själva mejlet. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escape(layout.preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <tr>
            <td style="padding:0 0 18px;font-family:${FONT};font-size:19px;font-weight:600;letter-spacing:-0.3px;color:${COLORS.heading};">
              Tikkr
            </td>
          </tr>

          <tr>
            <td style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding:32px;">

              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:21px;font-weight:600;line-height:1.3;color:${COLORS.heading};">
                ${escape(layout.heading)}
              </h1>
${layout.paragraphs.map((text) => paragraph(text)).join("")}
${button}
${(layout.afterword ?? []).map((text) => paragraph(text, true)).join("")}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};">
              Tikkr — tidregistrering per order och arbetsmoment<br>
              En tjänst från TERAFALK AB
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

function compose(parts: {
  to: string;
  subject: string;
  lines: string[];
  layout: Layout;
}): EmailMessage {
  return {
    to: parts.to,
    subject: parts.subject,
    text: [...parts.lines, "", SIGNATURE_TEXT].join("\n"),
    html: render(parts.layout),
  };
}

/* -------------------------------------------------------------------------- */
/* Utskicken                                                                   */
/* -------------------------------------------------------------------------- */

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
  const validity = `Länken gäller i ${params.minutesValid} minuter och kan användas en gång.`;

  const reassurance =
    "Har du inte begärt något nytt lösenord behöver du inte göra någonting. " +
    "Ditt nuvarande lösenord fortsätter att gälla, och ingen kan komma åt " +
    "kontot utan länken ovan.";

  return compose({
    to: params.to,
    subject: "Återställ ditt lösenord till Tikkr",
    lines: [
      "Någon har begärt ett nytt lösenord till kontot som hör till den här",
      "adressen. Öppna länken nedan för att välja ett nytt:",
      "",
      params.link,
      "",
      validity,
      "",
      reassurance,
    ],
    layout: {
      preheader: `Välj ett nytt lösenord. ${validity}`,
      heading: "Återställ ditt lösenord",
      paragraphs: [
        "Någon har begärt ett nytt lösenord till kontot som hör till den här adressen.",
      ],
      button: { label: "Välj ett nytt lösenord", href: params.link },
      afterword: [validity, reassurance],
    },
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
  const validity = `Länken gäller i ${params.daysValid} dagar och kan användas en gång.`;

  const unknown =
    "Känner du inte igen avsändaren kan du bortse från det här mejlet. " +
    "Inget konto skapas förrän länken används.";

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
      validity,
      "",
      unknown,
    ],
    layout: {
      preheader: `${params.invitedByEmail} har bjudit in dig som administratör.`,
      heading: `Välkommen till ${params.companyName}`,
      paragraphs: [
        `<strong style="color:${COLORS.heading};font-weight:600;">${escape(
          params.invitedByEmail
        )}</strong> har bjudit in dig som administratör för ${escape(
          params.companyName
        )} i Tikkr, där arbetstid registreras per order och arbetsmoment.`,
        "Välj ett lösenord så är du igång.",
      ],
      button: { label: "Skapa mitt konto", href: params.link },
      afterword: [validity, unknown],
    },
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
  const warning =
    "Var det inte du som gjorde det — svara på det här mejlet omgående, så " +
    "hjälper vi dig att säkra kontot.";

  return compose({
    to: params.to,
    subject: "Ditt lösenord till Tikkr har ändrats",
    lines: [
      "Lösenordet till ditt Tikkr-konto har just ändrats. Alla enheter som var",
      "inloggade har loggats ut.",
      "",
      warning,
    ],
    layout: {
      preheader: "Lösenordet till ditt Tikkr-konto har ändrats.",
      heading: "Ditt lösenord har ändrats",
      paragraphs: [
        "Lösenordet till ditt Tikkr-konto har just ändrats. Alla enheter som var inloggade har loggats ut.",
      ],
      afterword: [warning],
    },
  });
}
