import { NextResponse } from "next/server";
import { getKioskSession } from "@/lib/kiosk-auth";
import { forCompany } from "@/lib/tenant";
import { describeEntry } from "@/lib/entry-label";
import { getOpenBreaks } from "@/lib/breaks";
import { hasModule } from "@/lib/company-modules";
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

  // Skärmens egna inställningar åker med på samma svar.
  //
  // Rutten ska förbli liten, och två skalärer är den billigaste vägen till
  // att en ändring i adminpanelen syns på väggen inom fem sekunder. Ett eget
  // pollningsanrop hade kostat dubbelt för samma sak.
  const device = await db.kioskDevice.findFirst({
    where: { id: session.deviceId },
    select: { brightness: true, restartRequestedAt: true },
  });

  // Rasterna hämtas samtidigt. En person på lunch har inga öppna stämplingar
  // och skulle annars se ledig ut på de andra skärmarna — och någon skulle
  // stämpla in dem på ett jobb de inte står vid.
  //
  // Utan lönemodulen finns inga raster att hämta. Frågan ställs inte alls
  // då, i stället för att ställas och svara tomt: rutten anropas av varje
  // skärm var femte sekund.
  const payroll = await hasModule(session.companyId, "PAYROLL");
  const openBreaks = payroll ? await getOpenBreaks(db) : [];

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
  //
  // Typen skrivs ut. Utan den blir uttrycket unionen `{...}[] | never[]`, och
  // .map() går inte att anropa på en union av arraytyper.
  const rows: { id: string; name: string }[] = payroll
    ? await db.breakType.findMany({ select: { id: true, name: true } })
    : [];

  const breakTypes = new Map(rows.map((type) => [type.id, type.name]));

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

  const breaks: Record<string, { since: string; name: string }> = {};

  for (const rest of openBreaks) {
    const type = breakTypes.get(rest.breakTypeId);
    breaks[rest.employeeId] = {
      since: rest.startedAt.toISOString(),
      name: type ?? "Rast",
    };
  }

  return NextResponse.json(
    {
      active,
      breaks,
      device: {
        brightness: device?.brightness ?? null,
        restartRequestedAt: device?.restartRequestedAt?.toISOString() ?? null,
      },
    },
    // Får aldrig mellanlagras. En cachad bild av vem som arbetar är exakt det
    // problem som funktionen finns för att lösa.
    { headers: { "cache-control": "no-store" } }
  );
}
