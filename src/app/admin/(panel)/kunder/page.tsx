import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { searchCustomers } from "@/lib/customers";
import CustomerDialog from "@/components/admin/CustomerDialog";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { createCustomer, toggleCustomer } from "./actions";

/**
 * KUNDREGISTRET.
 *
 * Ersatte fritextfältet på ordern. Utan registret blev "Volvo", "volvo
 * lastvagnar" och "VOLVO AB" tre kunder i varje rapport.
 *
 * SÖKNING OCH INTE BARA EN LISTA. En verkstad med hundra kunder hittar inte
 * rätt genom att skrolla, och den som har kundnumret på en följesedel ska
 * slippa gissa hur namnet stavades den dagen det skrevs in.
 *
 * Sökningen ligger i adressen, så att en träfflista går att spara och skicka
 * vidare — samma val som i plattformsvyn.
 */

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { db } = await requireAdmin();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const customers = await searchCustomers(db, query);

  const active = customers.filter((customer) => customer.active).length;

  return (
    <>
      <PageHeader
        title="Kunder"
        action={
          <CustomerDialog
            trigger="Lägg till kund"
            title="Ny kund"
            action={createCustomer}
            submitLabel="Lägg till"
          />
        }
      />

      {customers.length === 0 && !query ? (
        <EmptyState
          title="Inga kunder upplagda"
        />
      ) : (
        <Card>
          <CardHeader
            title={
              query
                ? `${customers.length} ${
                    customers.length === 1 ? "träff" : "träffar"
                  }`
                : `${customers.length} ${
                    customers.length === 1 ? "kund" : "kunder"
                  }`
            }
            description={query ? `Sökning på ”${query}”` : `${active} aktiva`}
            action={
              /* Vanligt GET-formulär, utan JavaScript. Sökningen hamnar i
                 adressen och går därmed att spara som bokmärke. */
              <form className="flex gap-2">
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Namn, kundnr, org.nr…"
                  className="w-52 rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
                <Button type="submit" tone="secondary">
                  Sök
                </Button>
                {query && (
                  <ButtonLink href="/admin/kunder" tone="ghost">
                    Rensa
                  </ButtonLink>
                )}
              </form>
            }
          />

          {customers.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-neutral-500">
              Ingen kund matchar ”{query}”. Sökningen tittar på namn,
              kundnummer och organisationsnummer.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Kund</Th>
                  <Th>Org.nr</Th>
                  <Th>Ort</Th>
                  <Th numeric>Ordrar</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Åtgärder</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <Tr key={customer.id} dimmed={!customer.active}>
                    <Td>
                      {/* Namnet är vägen till kundsidan. Det är den enda
                          platsen där tid, pengar och ordrar står samlade. */}
                      <Link
                        href={`/admin/kunder/${customer.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.customerNumber && (
                        <span className="ml-2 text-neutral-400">
                          {customer.customerNumber}
                        </span>
                      )}
                    </Td>
                    <Td muted>
                      {customer.orgNumber ?? (
                        <span className="text-neutral-300">—</span>
                      )}
                    </Td>
                    <Td muted>
                      {customer.city ?? (
                        <span className="text-neutral-300">—</span>
                      )}
                    </Td>
                    <Td numeric muted>
                      {customer.orders}
                    </Td>
                    <Td>
                      {customer.active ? (
                        <Badge tone="active">Aktiv</Badge>
                      ) : (
                        <Badge tone="muted">Avaktiverad</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <form action={toggleCustomer}>
                          <input
                            type="hidden"
                            name="id"
                            value={customer.id}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={String(!customer.active)}
                          />
                          <Button type="submit" tone="ghost">
                            {customer.active ? "Avaktivera" : "Aktivera"}
                          </Button>
                        </form>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
