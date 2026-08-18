import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-session";
import { getKioskSession } from "@/lib/kiosk-auth";
import { forCompany } from "@/lib/tenant";

/**
 * Serverar porträttet på en anställd.
 *
 * Nås både av adminpanelen och av stämplingsskärmen, som identifierar sig på
 * helt olika sätt — den ena med inloggning, den andra med sin skärmtoken.
 * Därför prövas båda.
 *
 * Adressen innehåller ett id, till skillnad från logotypens. Uppslaget går
 * därför genom företagsfiltret: den som frågar får bara bilder som hör till
 * det egna företaget, oavsett vilket id de skriver in. Ett foto på en person
 * är en personuppgift och får inte gå att hämta genom att gissa.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const companyId =
    (await currentAdmin())?.companyId ?? (await getKioskSession())?.companyId;

  if (!companyId) {
    return new NextResponse(null, { status: 401 });
  }

  const { employeeId } = await params;

  const employee = await forCompany(companyId).employee.findFirst({
    where: { id: employeeId },
    select: {
      photoData: true,
      photoMimeType: true,
      photoUpdatedAt: true,
    },
  });

  if (!employee?.photoData || !employee.photoMimeType) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(employee.photoData), {
    headers: {
      "content-type": employee.photoMimeType,
      // Privat: får sparas i skärmens egen webbläsare men aldrig i en delad
      // mellanlagring, där en annan kunds skärm skulle kunna få fel bild.
      "cache-control": "private, max-age=300",
      etag: `"${employee.photoUpdatedAt?.getTime() ?? 0}"`,
    },
  });
}
