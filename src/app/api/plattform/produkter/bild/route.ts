import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/platform-access";
import { readPlatformSession } from "@/lib/platform-session";
import { addProductImage, IMAGE_MAX_BYTES, ProductError } from "@/lib/shop/product-admin";

/**
 * LADDAR UPP EN PRODUKTBILD FRÅN PLATTFORMSPANELEN.
 *
 * En rutt och inte en serveråtgärd, eftersom serveråtgärder tar emot högst
 * 1 MB och ett produktfoto från en telefon är större. Gränsen här är 5 MB.
 *
 * Behörigheten prövas som på plattformens sidor. Kakan är SameSite=Lax och
 * följer därför inte med ett anrop från en annan sajt; avsändaren prövas
 * dessutom, eftersom rutten inte har serveråtgärdernas egen kontroll.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const email = await readPlatformSession();
  if (!email || !isPlatformAdmin(email)) {
    return NextResponse.json({ error: "Logga in i plattformspanelen." }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "Fel avsändare." }, { status: 403 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > IMAGE_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Bilden får vara högst 5 MB." }, { status: 413 });
  }

  const form = await request.formData();
  const productId = String(form.get("productId") ?? "");
  const file = form.get("image");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Välj en bildfil." }, { status: 400 });
  }

  try {
    await addProductImage({
      productId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      alt: String(form.get("alt") ?? "").trim(),
      illustration: form.get("illustration") === "on",
    });
  } catch (error) {
    if (error instanceof ProductError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  revalidatePath(`/plattform/produkter/${productId}`);
  return NextResponse.json({ ok: true });
}
