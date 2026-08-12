import { describe, it, expect } from "vitest";
import {
  evaluateAccess,
  trialEndDate,
  TRIAL_DAYS,
  type SubscriptionFacts,
} from "@/lib/subscription";

/**
 * Reglerna för utebliven betalning.
 *
 * Den viktigaste regeln finns inte som ett eget test utan gäller varenda rad
 * här: ingen nivå spärrar stämplingen. Går tid förlorad drabbar det anställda
 * som inte rår över fakturan, och den tiden går inte att rekonstruera.
 */

const now = new Date("2026-08-11T12:00:00Z");

function facts(overrides: Partial<SubscriptionFacts>): SubscriptionFacts {
  return {
    status: "TRIALING",
    trialEndsAt: null,
    pastDueSince: null,
    ...overrides,
  };
}

function inDays(days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("betalande kund", () => {
  it("har full åtkomst utan meddelanden", () => {
    const state = evaluateAccess(facts({ status: "ACTIVE" }), now);

    expect(state.level).toBe("full");
    expect(state.headline).toBe("");
  });
});

describe("provperiod", () => {
  it("full åtkomst i början, utan att störa", () => {
    const state = evaluateAccess(
      facts({ trialEndsAt: inDays(20) }),
      now
    );

    expect(state.level).toBe("full");
    expect(state.daysLeft).toBe(20);
  });

  it("varnar sista veckan", () => {
    const state = evaluateAccess(facts({ trialEndsAt: inDays(5) }), now);

    expect(state.level).toBe("warning");
    expect(state.daysLeft).toBe(5);
    expect(state.headline).toContain("5 dagar");
  });

  it("skriver dag i singular när det är en dag kvar", () => {
    const state = evaluateAccess(facts({ trialEndsAt: inDays(1) }), now);

    expect(state.headline).toContain("1 dag");
    expect(state.headline).not.toContain("dagar");
  });

  it("låser när tiden gått ut", () => {
    const state = evaluateAccess(facts({ trialEndsAt: inDays(-1) }), now);

    expect(state.level).toBe("locked");
    expect(state.detail).toContain("Stämplingsskärmarna är opåverkade");
  });

  it("saknat slutdatum låser ingen ute", () => {
    // Företag upplagda för hand kan sakna datum. Det får inte betyda att de
    // plötsligt inte kommer åt sina rapporter.
    const state = evaluateAccess(facts({ trialEndsAt: null }), now);
    expect(state.level).toBe("full");
  });

  it("provperioden är 30 dagar", () => {
    const slut = trialEndDate(now);
    expect(TRIAL_DAYS).toBe(30);
    expect(slut.toISOString()).toBe("2026-09-10T12:00:00.000Z");
  });
});

describe("utebliven betalning", () => {
  it("varnar under respiten istället för att låsa direkt", () => {
    // Stripe gör flera betalförsök. Ett kort som gått ut ska inte låsa
    // panelen i samma sekund.
    const state = evaluateAccess(
      facts({ status: "PAST_DUE", pastDueSince: inDays(-2) }),
      now
    );

    expect(state.level).toBe("warning");
    expect(state.daysLeft).toBe(8);
  });

  it("låser när respiten tagit slut", () => {
    const state = evaluateAccess(
      facts({ status: "PAST_DUE", pastDueSince: inDays(-11) }),
      now
    );

    expect(state.level).toBe("locked");
  });

  it("nyss uppstått ger hela respiten", () => {
    const state = evaluateAccess(
      facts({ status: "PAST_DUE", pastDueSince: now }),
      now
    );

    expect(state.level).toBe("warning");
    expect(state.daysLeft).toBe(10);
  });

  it("saknat datum behandlas som att det nyss hänt", () => {
    const state = evaluateAccess(
      facts({ status: "PAST_DUE", pastDueSince: null }),
      now
    );

    expect(state.level).toBe("warning");
  });
});

describe("avslutad prenumeration", () => {
  it("låser panelen", () => {
    const state = evaluateAccess(facts({ status: "CANCELED" }), now);
    expect(state.level).toBe("locked");
  });
});

describe("stämplingen spärras aldrig", () => {
  it("ingen kombination ger något som stoppar stämpling", () => {
    const alla: SubscriptionFacts[] = [
      facts({ status: "ACTIVE" }),
      facts({ status: "TRIALING", trialEndsAt: inDays(-30) }),
      facts({ status: "PAST_DUE", pastDueSince: inDays(-90) }),
      facts({ status: "CANCELED" }),
    ];

    for (const fall of alla) {
      const state = evaluateAccess(fall, now);

      // "locked" gäller adminpanelen. Att stämplingen skulle stoppas finns
      // inte som möjligt utfall — det är hela poängen med den här modulen.
      expect(["full", "warning", "locked"]).toContain(state.level);

      if (state.level === "locked") {
        expect(state.detail).toContain("Stämplingsskärmarna är opåverkade");
      }
    }
  });
});
