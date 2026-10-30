import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { searchCustomers } from "@/lib/customers";
import { listPaging, pageRows } from "@/lib/paging";
import CustomerDialog from "@/components/admin/CustomerDialog";
import SearchForm from "@/components/admin/SearchForm";
import Pager from "@/components/ui/Pager";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
  rowLink,
} from "@/components/ui";
import { createCustomer, toggleCustomer } from "./actions";

export const metadata = { title: "Kunder · Tikkr" };

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
  sida?: string;
  antal?: string;
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

  // Rubrikens antal gäller hela urvalet. Bara raderna delas upp.
  const active = customers.filter((customer) => customer.active).length;
  const page = listPaging(customers.length, params);

  return (
    <>
      <PageHeader
        title="Kunder"
        help="kunder"
        action={
          <CustomerDialog
            trigger="Ny kund"
            title="Lägg till kund"
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
              <SearchForm
                query={query}
                label="Sök kunder"
                placeholder="Namn, kundnr, org.nr…"
                clearHref="/admin/kunder"
                perPage={page.take}
              />
            }
          />

          {customers.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-neutral-500">
              Ingen kund matchar ”{query}”. Sökningen tittar på namn,
              kundnummer och organisationsnummer.
            </p>
          ) : (
            <Table cards>
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
                {pageRows(customers, page).map((customer) => (
                  <Tr key={customer.id} dimmed={!customer.active} linked>
                    <Td>
                      {/* Namnet är vägen till kundsidan. Det är den enda
                          platsen där tid, pengar och ordrar står samlade. */}
                      <Link
                        href={`/admin/kunder/${customer.id}`}
                        className={rowLink}
                      >
                        {customer.name}
                      </Link>
                      {customer.customerNumber && (
                        <span className="ml-2 text-neutral-500">
                          {customer.customerNumber}
                        </span>
                      )}
                    </Td>
                    <Td label="Org.nr" muted>
                      {customer.orgNumber ?? (
                        <span className="text-neutral-300">—</span>
                      )}
                    </Td>
                    <Td label="Ort" muted>
                      {customer.city ?? (
                        <span className="text-neutral-300">—</span>
                      )}
                    </Td>
                    <Td label="Ordrar" numeric muted>
                      {customer.orders}
                    </Td>
                    <Td label="Status">
                      {customer.active ? (
                        <Badge tone="active">Aktiv</Badge>
                      ) : (
                        <Badge tone="muted">Avaktiverad</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="relative z-10 flex justify-end">
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

          <Pager
            paging={page}
            total={customers.length}
            unit="kunder"
            path="/admin/kunder"
            keep={{ q: query }}
          />
        </Card>
      )}
    </>
  );
}
