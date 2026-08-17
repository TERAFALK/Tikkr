/**
 * UTSKICK AV E-POST.
 *
 * Tikkr behöver skicka mejl vid lösenordsåterställning, inbjudningar och
 * kvittenser. Det är den enda delen av systemet som beror på en tjänst utanför
 * servern — därför ligger allt bakom ett enda gränssnitt här.
 *
 * Poängen med gränssnittet: resten av koden anropar `sendEmail()` och behöver
 * aldrig veta vem som skickar. Byter du från din egen Microsoft-tenant till en
 * separat för Tikkr, eller till en helt annan leverantör, ändras ingenting
 * utanför den här filen.
 *
 * Konfigureras med MAIL_PROVIDER i .env:
 *   log   — skriver mejlet i loggen istället för att skicka. Standard, och
 *           rätt läge i labbmiljö: inga mejl går ut av misstag till riktiga
 *           adresser i testdata.
 *   graph — Microsoft Graph, se nedan.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Ren text. Skickas alltid — vissa läser mejl utan formatering. */
  text: string;
  html?: string;
  /**
   * Dit svar ska gå.
   *
   * Utskicken kommer från en avsändare som inte tar emot post. Någon som fått
   * ett mejl de inte förstår kommer ändå att svara på det, och då ska svaret
   * landa hos en människa i stället för att studsa.
   */
  replyTo?: string;
}

export interface EmailResult {
  delivered: boolean;
  provider: string;
  /** Ifylld när något gick fel, skriven för att läsas av en människa. */
  problem?: string;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = (process.env.MAIL_PROVIDER ?? "log").toLowerCase();

  switch (provider) {
    case "graph":
      return sendViaGraph(message);
    case "log":
      return logInstead(message);
    default:
      console.error(`Okänd MAIL_PROVIDER "${provider}" — mejlet skickades inte.`);
      return {
        delivered: false,
        provider,
        problem: `Okänd MAIL_PROVIDER "${provider}".`,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Labbläge                                                                    */
/* -------------------------------------------------------------------------- */

function logInstead(message: EmailMessage): EmailResult {
  console.log(
    [
      "",
      "──────── E-POST (inte skickad — MAIL_PROVIDER=log) ────────",
      `Till:   ${message.to}`,
      `Ämne:   ${message.subject}`,
      "",
      message.text,
      "───────────────────────────────────────────────────────────",
      "",
    ].join("\n")
  );

  return { delivered: false, provider: "log" };
}

/* -------------------------------------------------------------------------- */
/* Microsoft Graph                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Skickar via Microsoft Graph med applikationsbehörighet.
 *
 * Förberedelser i Entra ID (tidigare Azure AD):
 *   1. Registrera en app. Notera Directory (tenant) ID och Application ID.
 *   2. Skapa en client secret. Notera värdet — det visas bara en gång.
 *   3. API-behörigheter → Microsoft Graph → Application permissions →
 *      Mail.Send. Klicka "Grant admin consent".
 *   4. Sätt i .env:
 *        MAIL_PROVIDER=graph
 *        GRAPH_TENANT_ID=...
 *        GRAPH_CLIENT_ID=...
 *        GRAPH_CLIENT_SECRET=...
 *        GRAPH_SENDER=no-reply@dindoman.se
 *
 * GRAPH_SENDER måste vara en postlåda som finns i tenanten. En delad postlåda
 * fungerar och är att föredra framför en personlig.
 *
 * Observera: Mail.Send som applikationsbehörighet ger rätt att skicka som
 * VILKEN postlåda som helst i tenanten. Begränsningen till en enda görs med en
 * "application access policy" i Exchange Online, och ÄR uppsatt — se
 * docs/drift.md. Utan den skulle en komprometterad Tikkr-server kunna skicka
 * mejl i hela organisationens namn.
 *
 * MAIL_REPLY_TO anger vart svar ska gå, eftersom avsändaren inte tar emot post.
 */
async function sendViaGraph(message: EmailMessage): Promise<EmailResult> {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const sender = process.env.GRAPH_SENDER;

  // Faller tillbaka på en gemensam supportadress, så att svar aldrig går till
  // en brevlåda som studsar allt.
  const replyTo = message.replyTo ?? process.env.MAIL_REPLY_TO;

  if (!tenantId || !clientId || !clientSecret || !sender) {
    const problem =
      "MAIL_PROVIDER=graph men GRAPH_TENANT_ID, GRAPH_CLIENT_ID, " +
      "GRAPH_CLIENT_SECRET eller GRAPH_SENDER saknas i .env.";
    console.error(problem);
    return { delivered: false, provider: "graph", problem };
  }

  let token: string;
  try {
    token = await graphToken({ tenantId, clientId, clientSecret });
  } catch (error) {
    const problem = `Kunde inte hämta åtkomsttoken från Microsoft: ${describe(error)}`;
    console.error(problem);
    return { delivered: false, provider: "graph", problem };
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: message.html
            ? { contentType: "HTML", content: message.html }
            : { contentType: "Text", content: message.text },
          toRecipients: [{ emailAddress: { address: message.to } }],
          ...(replyTo && {
            replyTo: [{ emailAddress: { address: replyTo } }],
          }),
        },
        // Kvitton i avsändarens skickat-mapp fyller den med automatmejl som
        // ingen läser. Innehållet finns i loggen om något behöver redas ut.
        saveToSentItems: false,
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const problem = `Microsoft Graph svarade ${response.status}: ${detail.slice(0, 300)}`;
    console.error(problem);
    return { delivered: false, provider: "graph", problem };
  }

  return { delivered: true, provider: "graph" };
}

/** Åtkomsttoken, återanvänd tills den nästan gått ut. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function graphToken(config: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  // En token gäller ungefär en timme. Att hämta en ny för varje mejl vore
  // både långsamt och ett onödigt anrop mot Microsoft.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text().catch(() => "")}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.value;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** true när riktiga mejl faktiskt går ut. Används för att visa rätt sak i UI. */
export function emailIsConfigured(): boolean {
  return (process.env.MAIL_PROVIDER ?? "log").toLowerCase() !== "log";
}
