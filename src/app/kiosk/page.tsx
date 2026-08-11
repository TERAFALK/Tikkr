import { getKioskSession } from "@/lib/kiosk-auth";
import { forCompany } from "@/lib/tenant";
import KioskScreen from "@/components/kiosk/KioskScreen";

// Kioskvyn. Hämtar allt skärmen behöver i ett svep och lämnar över till
// komponenten som sköter tryckningarna.
//
// Ingen cache: vilka som är instämplade ändras hela tiden, och en gammal bild
// vore direkt vilseledande.
export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const session = await getKioskSession();

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
        <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Skärmen är inte kopplad
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">
            Öppna kopplingslänken du fått av administratören en gång på den här
            skärmen. Sedan behöver du aldrig göra det igen.
          </p>
        </div>
      </main>
    );
  }

  const db = forCompany(session.companyId);

  const [employees, orders, moments, openEntries] = await Promise.all([
    db.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.order.findMany({
      where: { status: "OPEN" },
      orderBy: { orderNumber: "asc" },
      select: { id: true, orderNumber: true, customerName: true },
    }),
    db.workMoment.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.timeEntry.findMany({
      where: { clockOutAt: null },
      select: {
        employeeId: true,
        clockInAt: true,
        order: { select: { orderNumber: true } },
        moment: { select: { name: true } },
      },
    }),
  ]);

  const activeByEmployee = Object.fromEntries(
    openEntries.map((entry) => [
      entry.employeeId,
      {
        since: entry.clockInAt.toISOString(),
        orderNumber: entry.order.orderNumber,
        momentName: entry.moment.name,
      },
    ])
  );

  return (
    <KioskScreen
      companyName={session.companyName}
      deviceName={session.deviceName}
      employees={employees}
      orders={orders}
      moments={moments}
      activeByEmployee={activeByEmployee}
    />
  );
}
