/**
 * SIDBLÄDDRING I LISTOR SOM VÄXER MED VARJE STÄMPLING (issue #24).
 *
 * Stämplingar och Rapporter ritade varje rad i urvalet. En rapport utan datum
 * var då varje stämpling arbetsytan någonsin gjort, och sidan blev långsammare
 * för varje vecka kunden använde systemet. Nu visas en sida i taget.
 *
 * SUMMORNA GÄLLER FORTFARANDE HELA URVALET. Det är bara listan som delas upp:
 * totalen, grupperna och uttaget räknas på alla rader, och en sida som visade
 * sin egen summa vore ett fakturaunderlag som ändrades av att man bläddrade.
 * `pageGroups` finns för att grupperna ska behålla sina egna summor även när
 * en grupp delas mellan två sidor.
 *
 * Filen har inga importer. Den läses av fakturasidans rapportvy och skulle
 * kunna läsas av lönesidan, och ska därför inte dra in något från någondera.
 */

export const PER_PAGE = 50;

export interface Paging {
  /** Sidan som visas, från 1. */
  page: number;
  /** Alltid minst 1, även för ett tomt urval. */
  pageCount: number;
  /** Antal rader före sidan. */
  skip: number;
  take: number;
}

/**
 * Vilken sida som visas, ur antalet rader och `?sida=` i adressen.
 *
 * Ett nummer bortom sista sidan visar den sista. Ett bokmärke till sida 9 i
 * ett urval som sedan krympt ska visa något, inte en tom lista utan förklaring.
 */
export function paging(
  total: number,
  requested: string | undefined,
  perPage: number = PER_PAGE
): Paging {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const wanted = Math.floor(Number(requested));
  const page = Math.min(
    Math.max(1, Number.isFinite(wanted) ? wanted : 1),
    pageCount
  );

  return { page, pageCount, skip: (page - 1) * perPage, take: perPage };
}

/** Sidans rader ur en lista som redan är hämtad och sorterad. */
export function pageRows<T>(rows: T[], { skip, take }: Paging): T[] {
  return rows.slice(skip, skip + take);
}

/**
 * Sidans rader ur en grupperad lista, i gruppernas ordning.
 *
 * Grupperna behåller allt utom raderna orörda, så att en summa i rubriken
 * fortsätter gälla hela gruppen när bara en del av den ryms på sidan. En grupp
 * utan rader på sidan utelämnas.
 */
export function pageGroups<R, G extends { rows: R[] }>(
  groups: G[],
  { skip, take }: Paging
): G[] {
  const result: G[] = [];
  let offset = 0;

  for (const group of groups) {
    const start = Math.max(skip - offset, 0);
    const end = Math.min(skip + take - offset, group.rows.length);

    if (start < end) result.push({ ...group, rows: group.rows.slice(start, end) });

    offset += group.rows.length;
    if (offset >= skip + take) break;
  }

  return result;
}
