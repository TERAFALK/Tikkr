import { getKioskSession } from "@/lib/kiosk-auth";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { evaluateAccess } from "@/lib/subscription";
import { activeNotices } from "@/lib/notices";
import KioskScreen from "@/components/kiosk/KioskScreen";
import PairingForm from "@/components/kiosk/PairingForm";

// Kioskvyn. Hämtar allt skärmen behöver i ett svep och lämnar över till
// komponenten som sköter tryckningarna.
//
// Ingen cache: vilka som är instämplade ändras hela tiden, och en gammal bild
// vore direkt vilseledande.
export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const session = await getKioskSession();

  // Utan cookie visas kodfältet i stället för stämplingsvyn. Det är hela
  // uppsättningen: skriv in sex siffror en gång, sedan aldrig mer.
  if (!session) return <PairingForm />;

  const db = forCompany(session.companyId);

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: session.companyId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      pastDueSince: true,
      logoSquareMimeType: true,
    },
  });

  const access = evaluateAccess({
    status: company?.subscriptionStatus ?? "TRIALING",
    trialEndsAt: company?.trialEndsAt ?? null,
    pastDueSince: company?.pastDueSince ?? null,
  });

  const [employees, orders, moments, openEntries, notices] = await Promise.all([
    db.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      // photoMimeType i stallet for photoData: skarmen behover bara veta OM ett
      // portratt finns. Bilderna hamtas var for sig och mellanlagras av
      // webblasaren i stallet for att skickas med varje sidladdning.
      select: { id: true, name: true, photoMimeType: true },
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
    activeNotices("kiosk"),
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
      employees={employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        hasPhoto: Boolean(employee.photoMimeType),
      }))}
      orders={orders}
      moments={moments}
      activeByEmployee={activeByEmployee}
      // Stämplingen fungerar oavsett. Varningen finns för att någon i
      // verkstaden ska se den och fråga chefen — den som kan betala står
      // sällan vid skärmen.
      subscriptionWarning={
        access.level === "full" ? null : access.headline
      }
      hasLogo={Boolean(company?.logoSquareMimeType)}
      // Driftmeddelanden riktade till verkstaden. Bara de som markerats för
      // skärmarna — ett meddelande om rapporterna hör inte hemma på väggen.
      notices={notices.map((notice) => ({
        id: notice.id,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
      }))}
    />
  );
}
