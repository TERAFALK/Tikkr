import { NextResponse } from "next/server";
import { unsafeGlobalPrisma } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-access";
import { readPlatformSession } from "@/lib/platform-session";

/**
 * EN UPPLADDAD PRODUKTBILD.
 *
 * Publik, eftersom säljsidan visar bilderna för den som inte är inloggad.
 * Bara bilder på produkter som syns i butiken eller på säljsidan lämnas ut;
 * en dold produkts bilder ser bara plattformen, som förbereder den.
 *
 * Typen kommer ur databasen, där den satts efter filens innehåll vid
 * uppladdningen, och inte ur filnamnet.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const image = await unsafeGlobalPrisma.shopProductImage.findUnique({
    where: { id },
    select: {
      data: true,
      mimeType: true,
      createdAt: true,
      product: { select: { inShop: true, onSite: true } },
    },
  });

  if (!image?.data || !image.mimeType) {
    return new NextResponse(null, { status: 404 });
  }

  const visible = image.product.inShop || image.product.onSite;
  if (!visible && !isPlatformAdmin(await readPlatformSession())) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "content-type": image.mimeType,
      "x-content-type-options": "nosniff",
      // En bild byts genom att en ny laddas upp med ett nytt id. Samma id
      // ändras aldrig, så den får sparas länge. En dold produkts bild sparas
      // bara privat.
      "cache-control": visible ? "public, max-age=86400" : "private, no-store",
    },
  });
}
