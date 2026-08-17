import { NextResponse, type NextRequest } from "next/server";
import { currentAdmin } from "@/lib/admin-session";
import { getKioskSession } from "@/lib/kiosk-auth";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * Serverar kundens logotyp.
 *
 * `?variant=square` ger märket som visas i panelen och på stämplingsskärmen.
 * `?variant=wide` ger den breda som ligger överst på utskrifter.
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

export async function GET(request: NextRequest) {
  // Adminkontot slås upp på riktigt, precis som på panelens sidor. Ett
  // återkallat konto ska inte ha kvar någon väg in alls — inte ens den här.
  const companyId =
    (await currentAdmin())?.companyId ?? (await getKioskSession())?.companyId;

  if (!companyId) {
    return new NextResponse(null, { status: 401 });
  }

  const wide = request.nextUrl.searchParams.get("variant") === "wide";

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      logoSquareData: true,
      logoSquareMimeType: true,
      logoWideData: true,
      logoWideMimeType: true,
      logoUpdatedAt: true,
    },
  });

  const data = wide ? company?.logoWideData : company?.logoSquareData;
  const mimeType = wide
    ? company?.logoWideMimeType
    : company?.logoSquareMimeType;

  if (!data || !mimeType) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": mimeType,
      // Privat: får sparas i besökarens webbläsare men aldrig i en delad
      // mellanlagring, där en annan kunds skärm skulle kunna få fel bild.
      "cache-control": "private, max-age=300",
      etag: `"${wide ? "w" : "s"}-${company?.logoUpdatedAt?.getTime() ?? 0}"`,
    },
  });
}
