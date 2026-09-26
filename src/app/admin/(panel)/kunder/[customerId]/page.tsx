import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { customerStats, getCustomer } from "@/lib/customers";
import { formatDuration } from "@/lib/format";
import { formatMarkup } from "@/lib/money";
import CustomerDialog from "@/components/admin/CustomerDialog";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { updateCustomer } from "../actions";

/**
 * KUNDSIDAN.
 *
 * Svarar på frågan ingen kunde ställa förut: vad har vi gjort åt den här
 * kunden? Registret gjorde kunden till något systemet känner till, och det här
 * är stället där det märks.
 *
 * Allt räknas fram ur stämplingarna vid varje besök. Ingenting cachas, så en
 * rättad post slår igenom bakåt — och en siffra som inte stämmer med rapporten
 * för samma period är ett fel, inte en gammal uträkning.
 */

export const dynamic = "force-dynamic";

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { db } = await requireAdmin();
  const { customerId } = await params;

  const customer = await getCustomer(db, customerId);
  if (!customer) notFound();

  const stats = await customerStats(db, customerId);

  const address = [
    customer.addressLine,
    [customer.postalCode, customer.city].filter(Boolean).join(" "),
  ].filter(Boolean);

  const contact = [customer.contactName, customer.email, customer.phone].filter(
    Boolean
  );

  return (
    <>
      <Link
        href="/admin/kunder"
        className="text-[13px] font-medium text-blue-600 hover:underline"
      >
        ← Kundregistret
      </Link>

      <div className="mt-4">
        <PageHeader
          title={customer.name}
          description={
            [
              customer.customerNumber && `Kundnr ${customer.customerNumber}`,
              customer.orgNumber && `Org.nr ${customer.orgNumber}`,
              !customer.active && "Avaktiverad",
            ]
              .filter(Boolean)
              .join(" · ") || "Ingen ytterligare uppgift ifylld."
          }
          action={
            <CustomerDialog
              trigger="Ändra"
              triggerTone="secondary"
              title={`Ändra ${customer.name}`}
              action={updateCustomer}
              submitLabel="Spara"
              customer={customer}
            />
          }
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Öppna ordrar"
            value={stats.openOrders}
            tone={stats.openOrders > 0 ? "active" : "neutral"}
            hint={`${stats.orders.length} totalt`}
          />
          <Stat
            label="Tid totalt"
            value={formatDuration(stats.totalMinutes)}
            hint="tim:min på kundens ordrar"
          />
          <Stat
            label="Påslag"
            value={
              customer.markupPercent === null
                ? "Standard"
                : formatMarkup(customer.markupPercent)
            }
            hint={
              customer.markupPercent === null
                ? "företagets standard gäller"
                : "eget påslag för kunden"
            }
          />
          <Stat
            label="Rabatt"
            value={
              customer.discountPercent === null
                ? "Ingen"
                : `${customer.discountPercent} %`
            }
            hint="dras av efter påslaget"
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-400">
              Uppgifter
            </h2>

            {address.length > 0 && (
              <div className="mt-3 text-[13px] leading-relaxed text-neutral-700">
                {address.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

            {contact.length > 0 && (
              <div className="mt-3 border-t border-neutral-100 pt-3 text-[13px] leading-relaxed text-neutral-700">
                {contact.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

            {customer.notes && (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <p className="text-[13px] leading-relaxed text-neutral-500">
                  {customer.notes}
                </p>
              </div>
            )}

            {address.length === 0 && contact.length === 0 && !customer.notes && (
              <p className="mt-3 text-[13px] text-neutral-400">
                Inga kontaktuppgifter ifyllda.
              </p>
            )}
          </Card>

          {/* Vilka maskiner kundens jobb faktiskt belastar. Svarar på om en
              kund är svetstung eller monteringstung, vilket är en annan fråga
              än hur mycket tid de tagit. */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Vad vi gör åt dem"
              description="Tid per arbetsmoment, mest först."
            />
            {stats.byMoment.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-neutral-500">
                Ingen registrerad tid på kundens ordrar än.
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Arbetsmoment</Th>
                    <Th numeric>Tid (tim:min)</Th>
                    <Th numeric>Andel</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byMoment.map((moment) => (
                    <Tr key={moment.name}>
                      <Td>{moment.name}</Td>
                      <Td numeric>{formatDuration(moment.minutes)}</Td>
                      <Td numeric muted>
                        {Math.round(
                          (moment.minutes / Math.max(1, stats.totalMinutes)) *
                            100
                        )}{" "}
                        %
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="mt-6">
          {stats.orders.length === 0 ? (
            <EmptyState
              title="Inga ordrar på kunden"
              description="Ordrar som läggs upp med den här kunden vald samlas här."
              action={<ButtonLink href="/admin/ordrar">Till ordrar</ButtonLink>}
            />
          ) : (
            <Card>
              <CardHeader
                title="Ordrar"
                description="Öppna först. Det är dem man har en fråga om."
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Status</Th>
                    <Th numeric>Stämplingar</Th>
                    <Th numeric>Tid (tim:min)</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.orders.map((order) => (
                    <Tr key={order.id} dimmed={order.status !== "OPEN"}>
                      <Td>
                        <span className="font-medium">{order.orderNumber}</span>
                        {order.isQuickJob && (
                          <span className="ml-2">
                            <Badge tone="warning">Snabbjobb</Badge>
                          </span>
                        )}
                      </Td>
                      <Td>
                        {order.status === "OPEN" ? (
                          <Badge tone="active">Öppen</Badge>
                        ) : (
                          <Badge tone="muted">Avslutad</Badge>
                        )}
                      </Td>
                      <Td numeric muted>
                        {order.entries}
                      </Td>
                      <Td numeric>{formatDuration(order.minutes)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
