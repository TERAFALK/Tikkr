import { unsafeGlobalPrisma } from "./db";
import { sendEmail } from "./email";
import { broadcastEmail } from "./emails";

/**
 * MASSUTSKICK TILL KUNDERNAS ADMINISTRATÖRER.
 *
 * Används vid planerat underhåll och vid avbrott. Går till administratörerna,
 * aldrig till de anställda — vi har inga adresser till dem, och det är
 * avsiktligt.
 *
 * Fyra spärrar, alla för att ett massutskick inte går att ta tillbaka:
 *
 * 1. **Ingen marknadsföring.** Funktionen finns för driftinformation. Ett
 *    utskick om en ny funktion eller ett erbjudande är något annat, kräver
 *    annan rättslig grund och ska inte gå den här vägen.
 * 2. **Mottagarna räknas fram och visas innan** något skickas. Den som trycker
 *    ska veta hur många det gäller.
 * 3. **Allt loggas** i åtgärdsloggen med ämne och antal mottagare.
 * 4. **Ett mejl per mottagare**, aldrig en lång kopielista. En kundlista som
 *    läcker i ett To-fält är ett personuppgiftsbrott och en gratis
 *    konkurrentanalys.
 */

export type BroadcastAudience = "all" | "paying" | "trialing";

export const AUDIENCES: { value: BroadcastAudience; label: string }[] = [
  { value: "all", label: "Alla kunder" },
  { value: "paying", label: "Endast betalande" },
  { value: "trialing", label: "Endast provperioder" },
];

function statusFilter(audience: BroadcastAudience) {
  if (audience === "paying") return { subscriptionStatus: "ACTIVE" as const };
  if (audience === "trialing") {
    return { subscriptionStatus: "TRIALING" as const };
  }
  return {};
}

export interface Recipient {
  email: string;
  companyName: string;
}

/** Vilka som skulle få utskicket. Används både för förhandsbesked och sändning. */
export async function broadcastRecipients(
  audience: BroadcastAudience
): Promise<Recipient[]> {
  const rows = await unsafeGlobalPrisma.adminUser.findMany({
    where: { company: statusFilter(audience) },
    orderBy: { email: "asc" },
    select: { email: true, company: { select: { name: true } } },
  });

  return rows.map((row) => ({
    email: row.email,
    companyName: row.company.name,
  }));
}

export interface BroadcastResult {
  attempted: number;
  delivered: number;
  failed: string[];
}

export async function sendBroadcast(params: {
  audience: BroadcastAudience;
  subject: string;
  body: string;
  actorEmail: string;
}): Promise<BroadcastResult> {
  const subject = params.subject.trim();
  const body = params.body.trim();

  if (subject.length < 3) throw new BroadcastError("Skriv ett ämne.");
  if (!body) throw new BroadcastError("Skriv ett meddelande.");

  const recipients = await broadcastRecipients(params.audience);

  if (recipients.length === 0) {
    throw new BroadcastError("Urvalet innehåller inga mottagare.");
  }

  const failed: string[] = [];

  // Ett mejl i taget, i följd. Ett massutskick är inte tidskritiskt, och att
  // skicka hundra samtidigt är ett bra sätt att bli utkastad av leverantören.
  for (const recipient of recipients) {
    const result = await sendEmail(
      broadcastEmail({ to: recipient.email, subject, body })
    );

    if (!result.delivered && result.provider !== "log") {
      failed.push(recipient.email);
      console.error(
        `[utskick] Mejlet till ${recipient.email} gick inte fram: ` +
          `${result.problem ?? "okänd orsak"}`
      );
    }
  }

  await unsafeGlobalPrisma.platformAuditLog.create({
    data: {
      actorEmail: params.actorEmail,
      action: "Skickade massutskick",
      detail:
        `"${subject}" till ${recipients.length} mottagare ` +
        `(${params.audience})` +
        (failed.length > 0 ? `. ${failed.length} misslyckades.` : ""),
    },
  });

  return {
    attempted: recipients.length,
    delivered: recipients.length - failed.length,
    failed,
  };
}

export class BroadcastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BroadcastError";
  }
}
