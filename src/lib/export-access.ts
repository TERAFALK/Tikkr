import { NextResponse } from "next/server";
import type { AdminSession } from "./admin-session";
import { unsafeGlobalPrisma } from "./db";
import { evaluateAccess } from "./subscription";

/**
 * PRENUMERATIONSLÅSET FÖR UTTAGEN.
 *
 * Panelens lås ligger i layouten, och rutterna under /api renderas aldrig
 * genom den. Rapporten och orderunderlagen gick därför att hämta med en
 * direktlänk medan panelen stod låst — samma hål som § 3.1 i CLAUDE.md
 * beskriver för modulerna, och som tidrapportsrutten redan stängt för sig.
 *
 * Svarar med 402 när uttaget ska nekas, annars null.
 *
 * Supportläget släpps igenom, precis som i layouten: en obetald faktura är
 * oftast varför kunden ringer, och supportläget kan ändå bara läsa.
 */
export async function lockedExportResponse(
  session: AdminSession
): Promise<NextResponse | null> {
  if (session.support) return null;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: session.companyId },
    select: { subscriptionStatus: true, trialEndsAt: true, pastDueSince: true },
  });

  const access = evaluateAccess({
    status: company?.subscriptionStatus ?? "TRIALING",
    trialEndsAt: company?.trialEndsAt ?? null,
    pastDueSince: company?.pastDueSince ?? null,
  });

  if (access.level !== "locked") return null;

  return NextResponse.json({ error: access.headline }, { status: 402 });
}
