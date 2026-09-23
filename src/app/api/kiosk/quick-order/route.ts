import { NextResponse, type NextRequest } from "next/server";
import {
  getKioskSession,
  refreshKioskCookie,
  touchDevice,
} from "@/lib/kiosk-auth";
import { createQuickOrder, QuickOrderError } from "@/lib/quick-order";

/**
 * Skapar en order från stämplingsskärmen.
 *
 * Egen route och inte en del av /api/kiosk/punch, eftersom den till skillnad
 * från en stämpling MÅSTE lyckas innan något annat kan hända — tiden kan inte
 * peka på en order som ännu inte finns. Den går därför inte via offline-kön,
 * och skärmen väntar på svaret.
 */

export const runtime = "nodejs";

interface Body {
  orderNumber?: string;
  customerName?: string;
}

/** Så långt ett inslaget ordernummer får vara. Speglar kioskens knappsats. */
const MAX_ORDER_NUMBER = 20;

/** Så långt ett kundnamn får vara. Rymmer vilket företagsnamn som helst. */
const MAX_CUSTOMER_NAME = 120;

export async function POST(request: NextRequest) {
  const session = await getKioskSession();

  if (!session) {
    return NextResponse.json(
      { error: "Skärmen är inte kopplad. Hämta en ny kod i adminpanelen." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Trasigt anrop." }, { status: 400 });
  }

  const orderNumber = String(body?.orderNumber ?? "").trim();
  const customerName = String(body?.customerName ?? "").trim();

  if (orderNumber.length > MAX_ORDER_NUMBER) {
    return NextResponse.json(
      { error: "Ordernumret är för långt." },
      { status: 400 }
    );
  }

  if (customerName.length > MAX_CUSTOMER_NAME) {
    return NextResponse.json(
      { error: "Kundnamnet är för långt." },
      { status: 400 }
    );
  }

  try {
    const order = await createQuickOrder(session.companyId, {
      orderNumber: orderNumber || undefined,
      customerName: customerName || undefined,
    });

    await Promise.all([touchDevice(session.deviceId), refreshKioskCookie()]);

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    if (error instanceof QuickOrderError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Snabbjobbet kunde inte skapas", error);

    return NextResponse.json(
      { error: "Ordern kunde inte skapas. Försök igen." },
      { status: 500 }
    );
  }
}
