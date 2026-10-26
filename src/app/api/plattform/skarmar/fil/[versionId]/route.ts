import { NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/platform-access";
import { readPlatformSession } from "@/lib/platform-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { versionParts } from "@/lib/kiosk-config-store";
import { buildConfigFile } from "@/lib/kiosk-config";

/**
 * EN VERSION SOM HEL FIL, för att ladda ner.
 *
 * Samma fil skärmen läser in, med hemligheterna. Den behövs i ProDVX portal:
 * en ny skärm provisioneras därifrån, och portalens konfiguration ska vara
 * densamma som den skärmen sedan får härifrån.
 *
 * Bara plattformens administratörer, och en rutt för sig eftersom en
 * serveråtgärd inte kan lämna ut en fil.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const email = await readPlatformSession();
  if (!email || !isPlatformAdmin(email)) {
    return new NextResponse(null, { status: 401 });
  }

  const { versionId } = await params;
  const version = await unsafeGlobalPrisma.kioskConfigVersion.findUnique({
    where: { id: versionId },
    select: { version: true, config: { select: { name: true } } },
  });
  const parts = version ? await versionParts(versionId) : null;
  if (!version || !parts) return new NextResponse(null, { status: 404 });

  const name = `${version.config.name}-v${version.version}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return new NextResponse(JSON.stringify(buildConfigFile(parts, versionId), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name || "konfiguration"}.json"`,
      "cache-control": "no-store",
    },
  });
}
