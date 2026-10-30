/**
 * SÖKNINGEN I OPLACERAT.
 *
 * Med fyrtio öppna ordrar blev raden över tavlan sjuttio kort, och fem syns åt
 * gången. Sökningen tittar på ordernummer, kund och arbetsmoment. Filen har inga
 * importer: den läser bara fälten den får.
 */
export interface UnplacedFields {
  orderNumber: string;
  customerName: string | null;
  momentId: string;
  momentName: string;
}

export function filterUnplaced<T extends UnplacedFields>(
  rows: T[],
  query: string,
  momentId: string
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return rows.filter((row) => {
    if (momentId && row.momentId !== momentId) return false;

    const text =
      `${row.orderNumber} ${row.customerName ?? ""} ${row.momentName}`.toLowerCase();

    return words.every((word) => text.includes(word));
  });
}

/** Arbetsmomenten i listan, en gång var, i bokstavsordning. */
export function unplacedMoments(
  rows: UnplacedFields[]
): { id: string; name: string }[] {
  const moments = new Map(rows.map((row) => [row.momentId, row.momentName]));

  return [...moments]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}
