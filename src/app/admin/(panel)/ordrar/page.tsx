import { requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import NewOrderDialog from "@/components/admin/NewOrderDialog";
import OrdersTable from "@/components/admin/OrdersTable";
import SearchForm from "@/components/admin/SearchForm";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { orderRows } from "@/lib/orders";
import { customerOptions } from "@/lib/customers";
import { closeOrders, createOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  /**
   * `ny=1` öppnar Ny order direkt, genvägen på översikten. `q` är sökningen,
   * som i kundregistret: den ligger i adressen och går att spara.
   */
  searchParams: Promise<{ ny?: string; q?: string }>;
}) {
  const { db, companyId } = await requireAdmin();
  const { ny, q } = await searchParams;
  const query = q?.trim() ?? "";

  // Leveransdatumet i orderrutan hör till tillvalet Planering. Att det döljs
  // här är kosmetik — serveråtgärden frågar om modulen själv, se actions.ts.
  // Resten av sidan är basen och visas för varje kund.
  const planning = await hasModule(companyId, "PLANNING");

  // Hämtas parallellt: kundväljaren behöver hela registret, och en fråga till
  // kostar mindre än att sidan väntar på två i följd.
  const [customerList, moments, rows, quickJobs] = await Promise.all([
    customerOptions(db),
    db.workMoment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    orderRows(db, { query }),
    // Räknas för sig och inte ur listan: en sökning ska inte ändra hur många
    // ordrar som väntar på att kompletteras.
    db.order.count({ where: { isQuickJob: true } }),
  ]);

  // Två ställen, men bara rubrikens öppnas av genvägen. Öppnades båda
  // skulle två rutor ligga ovanpå varandra på en tom sida.
  const newOrder = (openOnMount: boolean) => (
    <NewOrderDialog
      customers={customerList}
      moments={moments}
      action={createOrder}
      planning={planning}
      openOnMount={openOnMount}
    />
  );

  return (
    <>
      <PageHeader
        title="Ordrar"
        help="ordrar"
        action={newOrder(ny === "1")}
      />

      {/* Ordrar som verkstaden lagt upp själv. De har ofta ett avskrivet
          nummer och saknar kund, och tiden på dem faktureras ändå — därför
          en rad som inte går att missa, inte bara en bricka i tabellen. */}
      {quickJobs > 0 && (
        <div className="mb-4">
          <Alert tone="warning">
            {quickJobs === 1
              ? "En order är skapad från en stämplingsskärm och behöver kompletteras."
              : `${quickJobs} ordrar är skapade från stämplingsskärmar och behöver kompletteras.`}{" "}
            Kontrollera ordernummer och kund. Märkningen försvinner när du
            sparat orderns uppgifter.
          </Alert>
        </div>
      )}

      {rows.length === 0 && !query ? (
        <EmptyState
          title="Inga ordrar upplagda"
          action={newOrder(false)}
        />
      ) : (
        <OrdersTable
          orders={rows}
          closeAction={closeOrders}
          query={query}
          search={
            <SearchForm
              query={query}
              placeholder="Ordernr, kund, kundnr…"
              clearHref="/admin/ordrar"
            />
          }
        />
      )}
    </>
  );
}
