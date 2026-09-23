import { getKioskSession } from "@/lib/kiosk-auth";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { evaluateAccess } from "@/lib/subscription";
import { activeNotices } from "@/lib/notices";
import { recentCustomerNames } from "@/lib/quick-order";
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

  // Hur långt bakåt ett "senaste jobb" får hämtas. Fyller två syften: ett
  // jobb från i våras är inget vettigt förslag att fortsätta på, och fönstret
  // håller frågan liten — Prismas `distinct` sorterar bort dubbletterna efter
  // att raderna hämtats, så utan gräns hade hela historiken lästs varje gång.
  const RECENT_WINDOW_DAYS = 14;
  const recentSince = new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const [
    employees,
    orders,
    moments,
    openEntries,
    recentEntries,
    notices,
    customers,
  ] = await Promise.all([
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
      // Senast påbörjad först, och uttryckligen sorterad: utan ordning avgör
      // databasen vilket jobb som hamnar överst, och det kan skilja mellan
      // två pollningar fem sekunder isär.
      orderBy: { clockInAt: "desc" },
      select: {
        employeeId: true,
        clockInAt: true,
        // Id:na behövs för att skärmen ska kunna bygga ett "senast"-förslag
        // direkt vid utstämpling, utan att först vänta på en omladdning.
        order: { select: { id: true, orderNumber: true } },
        moment: { select: { id: true, name: true } },
      },
    }),
    // Senast avslutade jobb per anställd — underlaget för "Fortsätt".
    // clockOutAt: not null utesluter den pågående stämplingen, så en
    // instämplad person aldrig får sig själv som förslag.
    db.timeEntry.findMany({
      where: { clockOutAt: { not: null }, clockInAt: { gte: recentSince } },
      distinct: ["employeeId"],
      orderBy: [{ employeeId: "asc" }, { clockInAt: "desc" }],
      select: {
        employeeId: true,
        order: { select: { id: true, orderNumber: true, status: true } },
        moment: { select: { id: true, name: true, active: true } },
      },
    }),
    activeNotices("kiosk"),
    // Underlaget för kundvalet när en anställd skapar en order på plats.
    // Namnen finns redan — skärmen ska kunna erbjuda ett tryck i stället
    // för ett tangentbord man knappt kan skriva på med handskar.
    recentCustomerNames(db),
  ]);

  // En LISTA per person. En operatör kan köra två maskiner samtidigt, och
  // Object.fromEntries hade behållit den sista posten tyst — skärmen hade då
  // visat ett jobb som pågick och dolt det andra.
  const activeByEmployee: Record<
    string,
    {
      since: string;
      orderId: string;
      orderNumber: string;
      momentId: string;
      momentName: string;
    }[]
  > = {};

  for (const entry of openEntries) {
    (activeByEmployee[entry.employeeId] ??= []).push({
      since: entry.clockInAt.toISOString(),
      orderId: entry.order.id,
      orderNumber: entry.order.orderNumber,
      momentId: entry.moment.id,
      momentName: entry.moment.name,
    });
  }

  // Ett förslag som inte går att trycka på är värre än inget förslag: ordern
  // kan ha stängts eller momentet avaktiverats sedan sist, och då hade
  // servern ändå vägrat stämplingen. Vi tar det GENUINT senaste jobbet och
  // låter det falla bort om det inte längre går att stämpla på — vi letar
  // alltså inte vidare bakåt efter något som råkar fungera. Ett "Senast"
  // som pekar på fel jobb får hela skärmen att se trasig ut.
  const recentByEmployee = Object.fromEntries(
    recentEntries
      .filter((entry) => entry.order.status === "OPEN" && entry.moment.active)
      .map((entry) => [
        entry.employeeId,
        {
          orderId: entry.order.id,
          orderNumber: entry.order.orderNumber,
          momentId: entry.moment.id,
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
      recentByEmployee={recentByEmployee}
      customers={customers}
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
