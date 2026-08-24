import { NextResponse } from "next/server";
import { INSTANCE_ID } from "@/lib/instance";

/**
 * Vilken serverprocess som svarar just nu.
 *
 * Kräver ingen inloggning: svaret är ett slumptal utan innebörd för någon
 * utomstående, och att kräva en session hade gjort att en utloggad flik aldrig
 * fick veta att den var gammal.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { instance: INSTANCE_ID },
    { headers: { "cache-control": "no-store" } }
  );
}
