/**
 * VART EN PERSONS NAMN LEDER.
 *
 * Till tidrapporten med löneunderlaget, och till personens stämplingar utan det
 * (beslutat 2026-10-30, produktägarens val). Ett namn i en lista ledde ingenstans,
 * och den som såg någon stå instämplad länge fick börja om från menyn.
 *
 * Filen har inga importer. Den läses från båda sidor om gränsen mellan
 * fakturaunderlaget och löneunderlaget, se CLAUDE.md § 1, och är bara en adress.
 */
export function personHref(employeeId: string, payroll: boolean): string {
  return payroll
    ? `/admin/tidrapport?anstalld=${employeeId}`
    : `/admin/stamplingar?employeeId=${employeeId}`;
}
