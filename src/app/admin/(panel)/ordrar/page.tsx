import { requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import NewOrderDialog from "@/components/admin/NewOrderDialog";
import OrdersTable from "@/components/admin/OrdersTable";
import SearchForm from "@/components/admin/SearchForm";
import Pager from "@/components/platform/Pager";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { orderCount, orderRows } from "@/lib/orders";
import { customerOptions } from "@/lib/customers";
import { listPaging } from "@/lib/paging";
import { closeOrders, createOrder } from "./actions";

export const metadata = { title: "Ordrar · Tikkr" };

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  /**
   * `ny=1` öppnar Ny order direkt, genvägen på översikten. `q` är sökningen,
   * som i kundregistret: den ligger i adressen och går att spara.
   */
  searchParams: Promise<{
    ny?: string;
    q?: string;
    sida?: string;
    antal?: string;
  }>;
}) {
  const { db, companyId } = await requireAdmin();
  const { ny, q, sida, antal } = await searchParams;
  const query = q?.trim() ?? "";

  // Leveransdatumet i orderrutan hör till tillvalet Planering. Att det döljs
  // här är kosmetik — serveråtgärden frågar om modulen själv, se actions.ts.
  // Resten av sidan är basen och visas för varje kund.
  const planning = await hasModule(companyId, "PLANNING");

  // Antalet först, så att ett sidnummer bortom slutet kan visa sista sidan.
  const total = await orderCount(db, { query });
  const page = listPaging(total, { sida, antal });

  // Hämtas parallellt: kundväljaren behöver hela registret, och en fråga till
  // kostar mindre än att sidan väntar på två i följd.
  const [customerList, moments, rows, quickJobs] = await Promise.all([
    customerOptions(db),
    db.workMoment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    orderRows(db, { query, skip: page.skip, take: page.take }),
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

      {total === 0 && !query ? (
        <EmptyState
          title="Inga ordrar upplagda"
          action={newOrder(false)}
        />
      ) : (
        <OrdersTable
          orders={rows}
          total={total}
          closeAction={closeOrders}
          query={query}
          search={
            <SearchForm
              query={query}
              label="Sök ordrar"
              placeholder="Ordernr, kund, kundnr…"
              clearHref="/admin/ordrar"
              perPage={page.take}
            />
          }
          pager={
            <Pager
              paging={page}
              total={total}
              unit="ordrar"
              path="/admin/ordrar"
              keep={{ q: query }}
            />
          }
        />
      )}
    </>
  );
}
