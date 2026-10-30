import { NextResponse } from "next/server";
import type { AdminSession } from "./admin-session";
import { unsafeGlobalPrisma } from "./db";
import { evaluateAccess } from "./subscription";

/**
 * PRENUMERATIONSLÅSET FÖR UTTAGEN.
 *
 * requireAdmin() skickar en låst arbetsyta till låssidan, vilket är rätt för
 * en sida och fel för ett uttag: den som tryckt på en knapp ska få ett svar och
 * inte en HTML-sida som nedladdning. Uttagen kallar därför
 * requireAdminEvenIfLocked() och prövar låset här.
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
