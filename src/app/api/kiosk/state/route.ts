import { NextResponse } from "next/server";
import { getKioskSession } from "@/lib/kiosk-auth";
import { forCompany } from "@/lib/tenant";
import { describeEntry } from "@/lib/entry-label";
import type { KioskActiveJob } from "@/components/kiosk/KioskScreen";

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
    // Senast påbörjad först, och uttryckligen sorterad: utan ordning avgör
    // databasen vilket jobb som hamnar överst, och det kan skilja mellan
    // två pollningar fem sekunder isär.
    orderBy: { clockInAt: "desc" },
    select: {
      employeeId: true,
      clockInAt: true,
      // Id:na behövs för att skärmen ska kunna bygga ett "senast"-förslag
      // direkt vid utstämpling, utan att först vänta på en omladdning.
      kind: true,
      order: { select: { id: true, orderNumber: true } },
      moment: { select: { id: true, name: true } },
      indirectMoment: { select: { id: true, name: true } },
    },
  });

  // En LISTA per person. Att en operatör kör två maskiner samtidigt är numera
  // ett giltigt läge, och Object.fromEntries hade behållit den sista posten
  // tyst — skärmen hade då visat ett jobb som pågick och dolt det andra.
  const active: Record<string, KioskActiveJob[]> = {};

  for (const entry of open) {
    // En post utan sina fält ska inte kunna finnas — clock.ts vaktar det —
    // men en trasig rad ska tappas tyst i stället för att fälla skärmen.
    const choice =
      entry.kind === "INDIRECT"
        ? entry.indirectMoment
          ? ({
              kind: "INDIRECT",
              indirectMoment: entry.indirectMoment,
            } as const)
          : null
        : entry.order && entry.moment
          ? ({
              kind: "ORDER",
              order: {
                id: entry.order.id,
                orderNumber: entry.order.orderNumber,
              },
              moment: entry.moment,
            } as const)
          : null;

    if (!choice) continue;

    (active[entry.employeeId] ??= []).push({
      since: entry.clockInAt.toISOString(),
      label: describeEntry(entry).text,
      choice,
    });
  }

  return NextResponse.json(
    { active },
    // Får aldrig mellanlagras. En cachad bild av vem som arbetar är exakt det
    // problem som funktionen finns för att lösa.
    { headers: { "cache-control": "no-store" } }
  );
}
