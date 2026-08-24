import Link from "next/link";
import { Table, Td, Th, Tr } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

/**
 * ÅTGÄRDSLOGGEN SOM TABELL.
 *
 * Samma tabell på tre ställen: företagets sida, företagets fulla historik och
 * hela installationens händelselogg. Ligger i en komponent eftersom kolumnerna
 * annars glider isär — och en logg som ser olika ut beroende på var man läser
 * den är svårare att lita på.
 */

export interface ActivityRow {
  id: string;
  actorEmail: string;
  action: string;
  detail: string | null;
  targetCompanyId: string | null;
  createdAt: Date;
}

export default function ActivityTable({
  rows,
  companyNames,
}: {
  rows: ActivityRow[];
  /**
   * Företagsnamn per id. Anges bara i vyer som blandar flera företag — på ett
   * enskilt företags sida står namnet redan i rubriken.
   */
  companyNames?: Map<string, string>;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>När</Th>
          {companyNames && <Th>Företag</Th>}
          <Th>Vem</Th>
          <Th>Vad</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td muted>{formatDateTime(row.createdAt)}</Td>

            {companyNames && (
              <Td muted>
                {row.targetCompanyId && companyNames.has(row.targetCompanyId) ? (
                  <Link
                    href={`/plattform/${row.targetCompanyId}`}
                    className="font-medium text-blue-600"
                  >
                    {companyNames.get(row.targetCompanyId)}
                  </Link>
                ) : (
                  // Raden kan handla om ett företag som sedan raderats, eller
                  // om något som inte rör ett enskilt företag alls.
                  "—"
                )}
              </Td>
            )}

            <Td muted>{row.actorEmail}</Td>

            <Td>
              {row.action}
              {row.detail && (
                <span className="mt-0.5 block text-neutral-500">
                  {row.detail}
                </span>
              )}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
