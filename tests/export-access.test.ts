import { describe, it, expect, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { lockedExportResponse } from "@/lib/export-access";
import type { AdminSession } from "@/lib/admin-session";

/**
 * PRENUMERATIONSLÅSET GÄLLER ÄVEN UTTAGEN.
 *
 * Panelens lås ligger i layouten, och /api-rutterna renderas aldrig genom den.
 * En kund med utgången provperiod kunde därför ta ut rapporter och underlag
 * med en direktlänk. Det testerna skyddar: ett låst företag får 402, ett
 * öppet får gå vidare, och supportläget släpps igenom som i panelen.
 */

const created: string[] = [];

async function sessionFor(data: {
  subscriptionStatus: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  trialEndsAt?: Date | null;
}, support = false): Promise<AdminSession> {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: "Låstest AB", ...data },
  });
  created.push(company.id);

  return {
    userId: "u",
    email: "chef@lastest.se",
    companyId: company.id,
    companyName: company.name,
    role: "OWNER",
    db: forCompany(company.id),
    ...(support ? { support: { visitId: "v" } } : {}),
  };
}

afterAll(async () => {
  await unsafeGlobalPrisma.company.deleteMany({ where: { id: { in: created } } });
});

describe("lockedExportResponse", () => {
  it("nekar ett företag vars provperiod tagit slut", async () => {
    const session = await sessionFor({
      subscriptionStatus: "TRIALING",
      trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const response = await lockedExportResponse(session);
    expect(response?.status).toBe(402);
  });

  it("nekar ett avslutat företag", async () => {
    const session = await sessionFor({ subscriptionStatus: "CANCELED" });
    expect((await lockedExportResponse(session))?.status).toBe(402);
  });

  it("släpper igenom ett betalande företag", async () => {
    const session = await sessionFor({ subscriptionStatus: "ACTIVE" });
    expect(await lockedExportResponse(session)).toBeNull();
  });

  it("släpper igenom supportläget, som i panelen", async () => {
    const session = await sessionFor({ subscriptionStatus: "CANCELED" }, true);
    expect(await lockedExportResponse(session)).toBeNull();
  });
});
