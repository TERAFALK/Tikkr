import Link from "next/link";
import { listCompanies, requirePlatformAdmin } from "@/lib/platform-admin";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import PlatformShell from "@/components/platform/PlatformShell";
import Pager from "@/components/platform/Pager";
import { SubscriptionBadge } from "@/components/platform/Pieces";

/** Antal företag per sida i listan. */
const PER_PAGE = 25;

export const dynamic = "force-dynamic";
export const metadata = { title: "Kunder · Tikkr" };

/**
 * KUNDLISTAN.
 *
 * Egen sida sedan översikten delades upp. Hit kommer man för att leta reda på
 * ett visst företag, och då ska ingenting annat stå i vägen — nyckeltal, graf
 * och bevakningslistor låg tidigare ovanför tabellen och sköt ned den under
 * skärmkanten.
 *
 * Siffrorna i tabellen räknas per företag. Summeringarna hör hemma på
 * översikten, eftersom en månadsintäkt som ändrar sig när man söker inte är en
 * månadsintäkt.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sida?: string }>;
}) {
  const { email } = await requirePlatformAdmin();

  const search = await searchParams;
  const query = (search.q ?? "").trim();

  const companies = await listCompanies();

  const matches = query
    ? companies.filter((company) =>
        company.name.toLowerCase().includes(query.toLowerCase())
      )
    : companies;

  const pageCount = Math.max(1, Math.ceil(matches.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number(search.sida) || 1), pageCount);
  const shown = matches.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  /** Bevarar sökningen när man bläddrar. */
  const listHref = (next: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("sida", String(next));
    return `/plattform/kunder?${params}`;
  };

  const kr = (value: number) => `${value.toLocaleString("sv-SE")} kr`;

  return (
    <PlatformShell email={email} current="/plattform/kunder">
      <PageHeader title="Kunder" />

      {companies.length === 0 ? (
        <EmptyState title="Inga registrerade företag" />
      ) : (
        <Card>
          <CardHeader
            title={
              query
                ? `${matches.length} träffar`
                : `${companies.length} företag`
            }
            action={
              /* Formulär utan JavaScript. Sökningen hamnar i adressen, så att
                 en träfflista går att spara och skicka vidare. */
              <form className="flex gap-2">
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Sök företag…"
                  className="w-44 rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
                <button
                  type="submit"
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white"
                >
                  Sök
                </button>
              </form>
            }
          />

          <Table>
            <thead>
              <tr>
                <Th>Företag</Th>
                <Th>Prenumeration</Th>
                <Th numeric>Licenser</Th>
                <Th numeric>Per månad</Th>
                <Th numeric>Anställda</Th>
                <Th numeric>Stämplingar 30 d</Th>
                <Th>Senaste aktivitet</Th>
                <Th>Upplagt</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((company) => (
                <Tr key={company.id}>
                  <Td>
                    <Link
                      href={`/plattform/kunder/${company.id}`}
                      className="font-medium text-blue-600"
                    >
                      {company.name}
                    </Link>
                  </Td>
                  <Td>
                    <SubscriptionBadge status={company.subscriptionStatus} />
                  </Td>
                  <Td numeric muted>
                    {company.licenses}
                  </Td>
                  <Td numeric>
                    {company.monthlyRevenue > 0
                      ? kr(company.monthlyRevenue)
                      : "—"}
                  </Td>
                  <Td numeric muted>
                    {company.employees}
                  </Td>
                  <Td numeric>
                    {company.entriesLast30Days === 0 ? (
                      <span className="text-neutral-400">0</span>
                    ) : (
                      company.entriesLast30Days
                    )}
                  </Td>
                  <Td muted>
                    {company.lastActivityAt
                      ? formatDateTime(company.lastActivityAt)
                      : "Aldrig"}
                  </Td>
                  <Td muted>{formatDate(company.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          {matches.length === 0 && (
            <p className="px-5 py-6 text-center text-[13px] text-neutral-500">
              Inget företag matchar ”{query}”.{" "}
              <Link href="/plattform/kunder" className="text-blue-600">
                Visa alla
              </Link>
            </p>
          )}

          <Pager
            page={page}
            pageCount={pageCount}
            total={matches.length}
            unit={query ? "träffar" : "företag"}
            hrefFor={listHref}
          />
        </Card>
      )}
    </PlatformShell>
  );
}
