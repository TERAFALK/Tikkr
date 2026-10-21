import type { ShopOrderStatus } from "@prisma/client";
import type { EmailMessage } from "./email";
import { formatCurrency } from "./money";

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

/**
 * Varumärkets färger, med namn efter vad de gör i mejlet.
 *
 * Värdena står utskrivna och importeras INTE från `brand.ts`. Skälet är att
 * mejlet byggs som en textsträng där varje färg står inne i ett `style`-attribut
 * — ett namn som behöver slås upp vid varje rad gör mallen svårare att läsa än
 * den redan är, och det är mallen som ska gå att granska. Ändras paletten står
 * det i `brand.ts` vilka sex färgerna är.
 */
const COLORS = {
  page: "#F5F6F2", // Snö
  card: "#FFFFFF",
  border: "#D9DDD6", // Lav
  heading: "#0E1A2B", // Fjord
  body: "#35404F",
  muted: "#5B6573", // Skiffer
  /*
    Knappen är Fjord och inte grönt.

    Paletten ger grönt som accent på ljus bakgrund, men vit text på Tick Deep
    når inte läsbarhetskravet, och ett mejl om ett glömt lösenord läses av någon
    som har bråttom. Fjord är dessutom samma färg som panelens knappar, vilket
    gör att mejlet och systemet ser ut att komma från samma avsändare.
  */
  accent: "#0E1A2B", // Fjord
  linkBox: "#F5F6F2", // Snö
};

/**
 * Typsnittet är mottagarens eget, inte Geist.
 *
 * Varumärket föreskriver Geist överallt, men ett mejl kan inte hämta ett
 * typsnitt: Outlook renderar med Words motor, och webbtypsnitt i mejl blockeras
 * eller ignoreras. Samma avvägning som regel 4 ovan — hellre ett mejl som
 * fungerar överallt än ett som ser rätt ut hos några.
 */
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Står sist i textversionen. HTML-versionen har samma sak i sin fot. */
const SIGNATURE_TEXT = [
  "—",
  "Tikkr · tidregistrering per order",
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
  /**
   * En tabell med två spalter efter styckena, för belopp. Texten escapas
   * här, till skillnad från styckena, eftersom den alltid är data.
   */
  rows?: { label: string; value: string; strong?: boolean }[];
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
          Fungerar inte knappen, kopiera adressen:
        </p>
        <p style="margin:0 0 18px;padding:10px 12px;background-color:${COLORS.linkBox};border:1px solid ${COLORS.border};border-radius:6px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.body};word-break:break-all;">
          ${escape(layout.button.href)}
        </p>`
    : "";

  // Beloppen står i en tabell och inte i en flexrad, av samma skäl som
  // knappen: Outlook känner bara tabeller. Beloppen högerställs så att
  // kronorna står under varandra.
  const rows = layout.rows?.length
    ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border-top:1px solid ${COLORS.border};">
${layout.rows
  .map(
    (row) => `          <tr>
            <td style="padding:8px 12px 8px 0;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;line-height:1.4;color:${
              row.strong ? COLORS.heading : COLORS.body
            };${row.strong ? "font-weight:600;" : ""}">${escape(row.label)}</td>
            <td align="right" style="padding:8px 0;border-bottom:1px solid ${COLORS.border};font-family:${FONT};font-size:14px;line-height:1.4;white-space:nowrap;color:${
              row.strong ? COLORS.heading : COLORS.body
            };${row.strong ? "font-weight:600;" : ""}">${escape(row.value)}</td>
          </tr>`
  )
  .join("\n")}
        </table>`
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
          <!-- Ordmärket: gement "tikkr", halvfet, knipning −5 % enligt
               varumärkesguiden. Satt som TEXT och inte som bild, eftersom
               regel 4 ovan säger att mejlet inte får innehålla externa bilder —
               ett ordmärke som försvinner när bildvisning är avstängd är värre
               än ett i mottagarens eget typsnitt. -->
            <td style="padding:0 0 18px;font-family:${FONT};font-size:19px;font-weight:600;letter-spacing:-0.95px;color:${COLORS.heading};">
              tikkr
            </td>
          </tr>

          <tr>
            <td style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding:32px;">

              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:21px;font-weight:600;line-height:1.3;color:${COLORS.heading};">
                ${escape(layout.heading)}
              </h1>
${layout.paragraphs.map((text) => paragraph(text)).join("")}
${rows}
${button}
${(layout.afterword ?? []).map((text) => paragraph(text, true)).join("")}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};">
              Tikkr · tidregistrering per order och arbetsmoment<br>
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

/**
 * Bekräftelse av e-postadressen, skickad vid registreringen.
 *
 * Ett välkomstmejl och en kontroll i samma utskick. Kommer det inte fram är
 * adressen fel, och det ska märkas första dagen och inte den dag lösenordet
 * glömts och återställningen går till fel inkorg.
 */
export function emailVerificationEmail(params: {
  to: string;
  link: string;
  companyName: string;
  daysValid: number;
}): EmailMessage {
  const validity = `Länken gäller i ${params.daysValid} dagar.`;

  const unknown =
    "Har du inte skapat någon arbetsyta i Tikkr kan du bortse från det här " +
    "mejlet.";

  return compose({
    to: params.to,
    subject: "Bekräfta din e-postadress i Tikkr",
    lines: [
      `Arbetsytan ${params.companyName} är skapad i Tikkr. Bekräfta att`,
      "adressen är din genom att öppna länken nedan:",
      "",
      params.link,
      "",
      validity,
      "",
      unknown,
    ],
    layout: {
      preheader: `Bekräfta e-postadressen för ${params.companyName}.`,
      heading: "Bekräfta din e-postadress",
      paragraphs: [
        `Arbetsytan ${escape(params.companyName)} är skapad i Tikkr. Bekräfta att adressen är din.`,
      ],
      button: { label: "Bekräfta adressen", href: params.link },
      afterword: [validity, unknown],
    },
  });
}

/**
 * En inloggningskod, när personen valt e-post i stället för appen.
 *
 * Koden står i ämnesraden. Den syns då i telefonens avisering, och den som
 * loggar in på datorn behöver inte öppna mejlet för att läsa av den.
 */
export function loginCodeEmail(params: {
  to: string;
  code: string;
  minutesValid: number;
}): EmailMessage {
  const validity = `Koden gäller i ${params.minutesValid} minuter och kan användas en gång.`;

  const unknown =
    "Har du inte försökt logga in just nu har någon annan ditt lösenord. " +
    "Byt lösenord under Inställningar, Användare, och svara på det här " +
    "mejlet så hjälper vi dig.";

  return compose({
    to: params.to,
    subject: `Din inloggningskod till Tikkr: ${params.code}`,
    lines: [
      "Din inloggningskod:",
      "",
      `    ${params.code}`,
      "",
      validity,
      "",
      unknown,
    ],
    layout: {
      preheader: `Din inloggningskod: ${params.code}`,
      heading: "Din inloggningskod",
      paragraphs: [
        `<span style="font-size:28px;font-weight:600;letter-spacing:6px;color:${COLORS.heading};">${escape(
          params.code
        )}</span>`,
      ],
      afterword: [validity, unknown],
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
 * Driftinformation till kundernas administratörer.
 *
 * Texten skrivs för hand i plattformspanelen. Den läggs in styckvis och
 * escapas, eftersom den passerar rakt in i HTML-versionen.
 */
export function broadcastEmail(params: {
  to: string;
  subject: string;
  body: string;
}): EmailMessage {
  const paragraphs = params.body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return compose({
    to: params.to,
    subject: params.subject,
    lines: [params.body],
    layout: {
      preheader: params.subject,
      heading: params.subject,
      paragraphs: paragraphs.map((block) =>
        // Enkla radbrytningar inom ett stycke behålls. Den som skriver ett
        // driftmeddelande radbryter ofta en uppräkning för hand.
        escape(block).replace(/\n/g, "<br>")
      ),
      afterword: [
        "Du får det här mejlet som administratör i Tikkr. Svara gärna om något är oklart.",
      ],
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
    "Var det inte du som gjorde det, svara på det här mejlet omgående, så " +
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

/* -------------------------------------------------------------------------- */
/* Beställningar av tillbehör                                                  */
/* -------------------------------------------------------------------------- */

/** Det mejlet behöver veta om en beställning. Ögonblicksbilden, aldrig mer. */
export interface ShopEmailOrder {
  number: number;
  companyName: string;
  contactName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  reference: string | null;
  lines: { name: string; quantity: number; subtotalOre: number }[];
  goodsOre: number;
  shippingOre: number | null;
  vatOre: number;
  totalOre: number;
  carrier: string | null;
  trackingUrl: string | null;
  /** Om något i beställningen skickas. Utan det nämns varken frakt eller leverans. */
  ships: boolean;
}

/** Ämne, rubrik och första stycket per läge. Läget avgör, inte anroparen. */
const SHOP_COPY: Partial<
  Record<ShopOrderStatus, { subject: (n: number) => string; heading: string; intro: (n: number) => string }>
> = {
  RECEIVED: {
    subject: (n) => `Beställning ${n} är mottagen`,
    heading: "Tack för beställningen",
    intro: (n) =>
      `Vi har tagit emot beställning ${n}. Vi går igenom den och hör av oss när den är bekräftad.`,
  },
  CONFIRMED: {
    subject: (n) => `Beställning ${n} är bekräftad`,
    heading: "Beställningen är bekräftad",
    intro: (n) => `Vi har bekräftat beställning ${n} och börjar förbereda den.`,
  },
  IN_PRODUCTION: {
    subject: (n) => `Beställning ${n} tillverkas`,
    heading: "Tillverkningen har börjat",
    intro: (n) => `Beställning ${n} tillverkas och förbereds nu.`,
  },
  SHIPPED: {
    subject: (n) => `Beställning ${n} är skickad`,
    heading: "Beställningen är skickad",
    intro: (n) => `Beställning ${n} har lämnat oss.`,
  },
  CANCELED: {
    subject: (n) => `Beställning ${n} är avbruten`,
    heading: "Beställningen är avbruten",
    intro: (n) => `Beställning ${n} är avbruten och kommer inte att levereras.`,
  },
  PROBLEM: {
    subject: (n) => `Om beställning ${n}`,
    heading: "Vi behöver stämma av beställningen",
    intro: (n) => `Det gäller beställning ${n}.`,
  },
};

/** Lägena som har ett mejl. Samma urval som notifiesCustomer i status.ts. */
export function hasShopEmail(status: ShopOrderStatus): boolean {
  return Boolean(SHOP_COPY[status]);
}

/**
 * Ett besked om en beställning.
 *
 * Bär alltid sammanställningen med moms, så att varje mejl om beställningen
 * går att läsa för sig. Interna anteckningar finns inte i det här anropet,
 * och kan därför inte hamna i ett mejl.
 *
 * Frakten står som "Tillkommer" tills vi satt den. Totalen heter då
 * "Summa, exkl. frakt", eftersom den inte är vad fakturan kommer att landa på.
 */
export function shopOrderEmail(params: {
  to: string;
  status: ShopOrderStatus;
  order: ShopEmailOrder;
  message: string | null;
  /** Beräknad leveranstid, ur katalogen. Står i de tidiga beskeden. */
  delivery: string | null;
  link: string;
}): EmailMessage {
  const { order, status } = params;
  const copy = SHOP_COPY[status];

  if (!copy) {
    throw new Error(`Inget mejl för läget ${status}.`);
  }

  const n = order.number;
  const shippingKnown = order.shippingOre !== null;
  // Frakten är okänd bara när något ska skickas och vi inte satt den än.
  const shippingPending = order.ships && !shippingKnown;

  const rows = [
    ...order.lines.map((line) => ({
      label: `${line.quantity} × ${line.name}`,
      value: formatCurrency(line.subtotalOre),
    })),
    { label: "Summa, exkl. moms", value: formatCurrency(order.goodsOre) },
    ...(order.ships || shippingKnown
      ? [
          {
            label: shippingKnown ? "Frakt, exkl. moms" : "Frakt",
            value: shippingKnown ? formatCurrency(order.shippingOre!) : "Tillkommer",
          },
        ]
      : []),
    { label: "Moms 25 %", value: formatCurrency(order.vatOre) },
    {
      label: shippingPending ? "Summa inkl. moms, exkl. frakt" : "Totalt inkl. moms",
      value: formatCurrency(order.totalOre),
      strong: true,
    },
  ];

  const early = status === "RECEIVED" || status === "CONFIRMED" || status === "IN_PRODUCTION";
  const deliveryLine = early && params.delivery ? params.delivery : null;

  const carrierLine =
    status === "SHIPPED" && order.carrier ? `Transportör: ${order.carrier}.` : null;

  const address = [
    order.contactName,
    order.addressLine,
    `${order.postalCode} ${order.city}`,
    order.reference ? `Märkning: ${order.reference}` : null,
  ].filter((part): part is string => Boolean(part));

  const addressLine = order.ships
    ? `Levereras till ${order.companyName}, ${address.join(", ")}.`
    : null;

  const invoiceLine =
    status === "RECEIVED"
      ? order.ships
        ? "Frakten tillkommer. Beställningen faktureras vid leverans."
        : "Beställningen faktureras separat."
      : status === "SHIPPED"
        ? "Fakturan kommer separat."
        : null;

  const reply = "Svara på det här mejlet om något inte stämmer.";

  const tracking =
    status === "SHIPPED" && order.trackingUrl
      ? { label: "Följ leveransen", href: order.trackingUrl }
      : null;

  const paragraphs = [
    escape(copy.intro(n)),
    ...(params.message
      ? params.message
          .split(/\n{2,}/)
          .map((block) => block.trim())
          .filter(Boolean)
          .map((block) => escape(block).replace(/\n/g, "<br>"))
      : []),
    ...(deliveryLine ? [escape(deliveryLine)] : []),
    ...(carrierLine ? [escape(carrierLine)] : []),
  ];

  const lines = [
    copy.intro(n),
    ...(params.message ? ["", params.message] : []),
    ...(deliveryLine ? ["", deliveryLine] : []),
    ...(carrierLine ? ["", carrierLine] : []),
    ...(tracking ? ["", `Följ leveransen: ${tracking.href}`] : []),
    "",
    ...rows.map((row) => `${row.label}: ${row.value}`),
    ...(addressLine ? ["", addressLine] : []),
    ...(invoiceLine ? ["", invoiceLine] : []),
    "",
    `Beställningen i Tikkr: ${params.link}`,
    "",
    reply,
  ];

  return compose({
    to: params.to,
    subject: copy.subject(n),
    lines,
    layout: {
      preheader: copy.intro(n),
      heading: copy.heading,
      paragraphs,
      rows,
      button: tracking ?? { label: "Visa beställningen", href: params.link },
      afterword: [
        ...(addressLine ? [escape(addressLine)] : []),
        ...(invoiceLine ? [escape(invoiceLine)] : []),
        ...(tracking ? [`Beställningen i Tikkr: ${escape(params.link)}`] : []),
        reply,
      ],
    },
  });
}
