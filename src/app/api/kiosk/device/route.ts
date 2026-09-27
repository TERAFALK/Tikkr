import { NextResponse, type NextRequest } from "next/server";
import { getKioskSession } from "@/lib/kiosk-auth";
import { forCompany } from "@/lib/tenant";

/**
 * SKÄRMEN BERÄTTAR VAD DEN ÄR.
 *
 * Anropas en gång när kiosksidan laddas, och bara av skärmar som kör i
 * kioskappen — en kunds egen dator har inget att rapportera och hör aldrig av
 * sig hit.
 *
 * Det är så adminpanelen vet vilka skärmar som går att fjärrstyra: är
 * `fullyVersion` ifylld är det en skärm vi sålt, och då visas ljusstyrka och
 * omstart. Är den null visas ingenting. En förmåga som skärmen själv intygar,
 * alltså, och inte en bock någon kryssat i och glömt.
 *
 * WebView-versionen sparas för felsökningens skull: offline-kön står på
 * service worker och IndexedDB, och när något krånglar är motorns version det
 * första man vill veta utan att behöva åka dit.
 */

export const runtime = "nodejs";

/** Versionssträngar är korta. Längre än så är något annat än en version. */
const MAX_LENGTH = 120;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_LENGTH);
}

export async function POST(request: NextRequest) {
  const session = await getKioskSession();
  if (!session) {
    return NextResponse.json(
      { error: "Skärmen är inte kopplad." },
      { status: 401 }
    );
  }

  let body: { fullyVersion?: unknown; webviewVersion?: unknown };
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
    data: {
      fullyVersion: clean(body.fullyVersion),
      webviewVersion: clean(body.webviewVersion),
    },
  });

  return NextResponse.json({ ok: true });
}
