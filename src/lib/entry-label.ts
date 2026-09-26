/**
 * VAD EN STÄMPLING AVSER, I KLARTEXT.
 *
 * En stämpling är antingen ORDER-tid, som ska faktureras en kundorder, eller
 * INDIRECT — improduktiv tid som aldrig når ett fakturaunderlag. De två har
 * olika fält ifyllda, och sex vyer stavade tidigare ut den skillnaden var för
 * sig.
 *
 * Samlat här av ett bestämt skäl: läggs en tredje sort till någon gång blir det
 * ETT kompileringsfel att rätta, inte sex tysta vyer som visar tomma rutor.
 */

export interface LabelledEntry {
  kind: "ORDER" | "INDIRECT";
  /**
   * `customer` är VALFRITT. Kiosken hämtar aldrig kunden — namnet tar plats på
   * en knapp utan att hjälpa den som ska stämpla — och ska ändå kunna använda
   * samma etikettlogik som adminpanelen.
   *
   * Två lager valfrihet, och båda behövs: `customer` saknas när anroparen inte
   * bett om den, och är null när ordern inte har någon kund.
   */
  order: {
    orderNumber: string;
    customer?: { name: string } | null;
  } | null;
  moment: { name: string } | null;
  indirectMoment: { name: string } | null;
}

export interface EntryLabel {
  /** "2601 · Svetsning" eller "Städning". */
  text: string;
  /** Kundnamnet, eller null. Bara ordertid har en kund. */
  customerName: string | null;
  /** true när tiden ska faktureras. Styr om raden hör hemma i ett underlag. */
  billable: boolean;
}

export function describeEntry(entry: LabelledEntry): EntryLabel {
  if (entry.kind === "INDIRECT") {
    return {
      // Namnet på det improduktiva momentet räcker. Det finns ingen order att
      // sätta framför, och att skriva "Improduktiv tid · Städning" vore att
      // säga samma sak två gånger.
      text: entry.indirectMoment?.name ?? "Improduktiv tid",
      customerName: null,
      billable: false,
    };
  }

  // Ordertid utan order eller moment ska inte kunna finnas — clock.ts vaktar
  // det. Skulle en rad ändå dyka upp visar vi att något är fel i stället för
  // att krascha vyn.
  const parts = [entry.order?.orderNumber, entry.moment?.name].filter(Boolean);

  return {
    text: parts.length > 0 ? parts.join(" · ") : "Uppgift saknas",
    customerName: entry.order?.customer?.name ?? null,
    billable: true,
  };
}
