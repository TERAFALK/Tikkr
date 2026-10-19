import { NextResponse, type NextRequest } from "next/server";
import { getKioskSession } from "@/lib/kiosk-auth";
import { forCompany } from "@/lib/tenant";
import { parseDeviceReport } from "@/lib/kiosk-report";

/**
 * SKÄRMEN BERÄTTAR VAD DEN ÄR.
 *
 * Anropas när kiosksidan laddas, var femte minut och när nätet kommer
 * tillbaka — och bara av skärmar som kör i kioskappen. En kunds egen dator har
 * inget att rapportera och hör aldrig av sig hit.
 *
 * Det är så adminpanelen vet vilka skärmar som går att fjärrstyra: är
 * `fullyVersion` ifylld är det en skärm vi sålt, och då visas knappen
 * Fjärrstyrning. Är den null visas ingenting. En förmåga som skärmen själv
 * intygar, alltså, och inte en bock någon kryssat i och glömt.
 *
 * Nätet rapporteras om och om igen, eftersom det ändras: en uppgift om
 * wifisignalen som lästes av för en timme sedan säger ingenting om nu. Vad av
 * anropet som får skrivas avgör `parseDeviceReport`.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getKioskSession();
  if (!session) {
    return NextResponse.json(
      { error: "Skärmen är inte kopplad." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Trasigt anrop." }, { status: 400 });
  }

  // Skrivs mot skärmens eget id ur sessionen, aldrig mot något ur anropet.
  // Ett id i en kropp hade varit en väg att skriva på en annan kunds skärm.
  // Går dessutom genom företagsfiltret, så även ett id på villovägar stannar.
  await forCompany(session.companyId).kioskDevice.updateMany({
    where: { id: session.deviceId },
    data: { ...parseDeviceReport(body), reportedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
