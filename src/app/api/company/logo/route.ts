import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getKioskSession } from "@/lib/kiosk-auth";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * Serverar kundens logotyp.
 *
 * Nås både av adminpanelen och av stämplingsskärmen, som identifierar sig på
 * helt olika sätt — den ena med inloggning, den andra med sin skärmtoken.
 * Därför prövas båda här.
 *
 * Adressen innehåller inget företags-id. Vilket företag som avses avgörs av
 * vem som frågar, vilket gör att ingen kan bläddra bland andras logotyper
 * genom att gissa id:n.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const companyId =
    session?.user?.companyId ?? (await getKioskSession())?.companyId;

  if (!companyId) {
    return new NextResponse(null, { status: 401 });
  }

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { logoData: true, logoMimeType: true, logoUpdatedAt: true },
  });

  if (!company?.logoData || !company.logoMimeType) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(company.logoData), {
    headers: {
      "content-type": company.logoMimeType,
      // Privat: får sparas i besökarens webbläsare men aldrig i en delad
      // mellanlagring, där en annan kunds skärm skulle kunna få fel bild.
      "cache-control": "private, max-age=300",
      etag: `"${company.logoUpdatedAt?.getTime() ?? 0}"`,
    },
  });
}
