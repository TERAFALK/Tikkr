import { NextResponse } from "next/server";
import { getKioskSession } from "@/lib/kiosk-auth";
import { forCompany } from "@/lib/tenant";

/**
 * VEM SOM ÄR INSTÄMPLAD JUST NU.
 *
 * Skärmarna delar läge. Stämplar någon in vid porten ska den som står vid
 * monteringen se det, och kunna stämpla ut personen därifrån — vilket servern
 * redan tillåter, eftersom en stämpling hör till en person och inte till en
 * skärm.
 *
 * Det som saknades var att skärmarna fick veta om varandra. Sidan hämtade sitt
 * läge en gång vid laddning och uppdaterade det bara efter sina EGNA tryck. En
 * skärm kunde därför visa någon som ledig i timmar efter att de stämplat in
 * någon annanstans.
 *
 * Svaret är avsiktligt litet: bara vilka som är instämplade och på vad.
 * Anropas var femte sekund av varje skärm, och ska därför kosta nästan
 * ingenting. Listorna med anställda, ordrar och moment ändras sällan och
 * hämtas i stället vid den långsammare omladdningen av sidan.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getKioskSession();

  if (!session) {
    return NextResponse.json(
      { error: "Skärmen är inte kopplad." },
      { status: 401 }
    );
  }

  const db = forCompany(session.companyId);

  const open = await db.timeEntry.findMany({
    where: { clockOutAt: null },
    select: {
      employeeId: true,
      clockInAt: true,
      order: { select: { orderNumber: true } },
      moment: { select: { name: true } },
    },
  });

  const active = Object.fromEntries(
    open.map((entry) => [
      entry.employeeId,
      {
        since: entry.clockInAt.toISOString(),
        orderNumber: entry.order.orderNumber,
        momentName: entry.moment.name,
      },
    ])
  );

  return NextResponse.json(
    { active },
    // Får aldrig mellanlagras. En cachad bild av vem som arbetar är exakt det
    // problem som funktionen finns för att lösa.
    { headers: { "cache-control": "no-store" } }
  );
}
