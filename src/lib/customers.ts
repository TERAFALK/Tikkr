import type { CompanyDb } from "./tenant";

/**
 * KUNDREGISTRET.
 *
 * Ersatte fritextfältet `Order.customerName` 2026-09-26. Tre saker blev
 * möjliga: kunden går att fråga om, namnet stavas likadant överallt, och
 * uppgifterna behöver inte skrivas för hand på varje underlag.
 *
 * EN normalisering, här. Före registret fanns tre olika regler — en i
 * `quick-order.ts`, en i orderformuläret, en i uppstartsguiden — plus en
 * längdgräns som bara gällde kiosken. Tre regler för samma sak är tre chanser
 * att två stavningar av samma kund blir två kunder.
 */

/** Så långt ett kundnamn får vara. Rymmer vilket företagsnamn som helst. */
export const MAX_NAME = 120;

/** Så långt ett fritt fält får vara. Gäller adress, kontakt, anteckning. */
export const MAX_FIELD = 200;

/**
 * Städar ett inskrivet värde.
 *
 * Trimmar, slår ihop upprepade mellanslag och gör tomt till null. "Volvo  AB "
 * och "Volvo AB" ska aldrig kunna bli två kunder på grund av ett tangentbord.
 */
export function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

  return text || null;
}

export interface CustomerOption {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Kunderna som går att välja, för väljaren i orderformulären.
 *
 * Bara aktiva. En avaktiverad kund behåller sina gamla ordrar men ska inte gå
 * att lägga nya på — det är hela innebörden av att avaktivera den.
 *
 * Kundnumret följer med som `hint`, så att det går att söka på det. Den som
 * har numret på en följesedel ska slippa gissa stavningen av namnet.
 */
export async function customerOptions(
  db: CompanyDb
): Promise<CustomerOption[]> {
  const customers = await db.customer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, customerNumber: true, orgNumber: true },
  });

  return customers.map((customer) => ({
    id: customer.id,
    label: customer.name,
    // Org.nr står inte här men söks i — se searchCustomers. På en rad i en
    // lista vore det brus; i en sökning är det precis vad man skriver när två
    // kunder heter nästan samma sak.
    hint: customer.customerNumber ?? undefined,
  }));
}

/**
 * Kunden ett formulär pekat ut, eller null.
 *
 * Slår upp genom det filtrerade lagret i stället för att lita på id:t. Ett id
 * kommer från ett formulär, och en order ska inte kunna peka på en kund som
 * inte finns — eller som hör till ett annat företag.
 *
 * Avaktiverade kunder GÅR att välja här, till skillnad från i kiosken. Admin
 * rättar ibland en gammal order, och då är kunden den som gällde då.
 */
export async function resolveCustomerId(
  db: CompanyDb,
  value: FormDataEntryValue | null
): Promise<string | null> {
  const id = String(value ?? "").trim();
  if (!id) return null;

  const customer = await db.customer.findFirst({
    where: { id },
    select: { id: true },
  });

  return customer?.id ?? null;
}

/**
 * Fritextsökning i registret.
 *
 * Söker i namn, kundnummer och org.nr. Skiftlägesokänsligt — projektets första
 * `mode: "insensitive"`, och skälet är just det problem registret löser: den
 * som skriver "volvo" ska hitta "Volvo Lastvagnar".
 *
 * Tom sökning ger hela registret. Filtret är till för att hitta något, inte
 * för att dölja allt tills man skrivit.
 */
export async function searchCustomers(
  db: CompanyDb,
  query: string | undefined
): Promise<
  {
    id: string;
    name: string;
    customerNumber: string | null;
    orgNumber: string | null;
    city: string | null;
    active: boolean;
    orders: number;
  }[]
> {
  const needle = query?.trim();

  const customers = await db.customer.findMany({
    where: needle
      ? {
          OR: [
            { name: { contains: needle, mode: "insensitive" } },
            { customerNumber: { contains: needle, mode: "insensitive" } },
            { orgNumber: { contains: needle, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      customerNumber: true,
      orgNumber: true,
      city: true,
      active: true,
      _count: { select: { orders: true } },
    },
  });

  return customers.map(({ _count, ...customer }) => ({
    ...customer,
    orders: _count.orders,
  }));
}
