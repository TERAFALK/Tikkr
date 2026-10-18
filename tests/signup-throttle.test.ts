import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { __resetThrottle } from "@/lib/login-throttle";

/**
 * TAKET PÅ NYA ARBETSYTOR GÄLLER ÄVEN SAMTIDIGA ANROP (2026-10-18).
 *
 * Försöket räknades först efter att arbetsytan skapats. Åtta anrop i samma
 * ögonblick hann alla förbi prövningen medan det första hashade sitt
 * lösenord, och åtta arbetsytor skapades på ett tak om fem.
 *
 * Inloggningen, mejlet och omdirigeringen ersätts: det som prövas är taket,
 * inte vad som händer efter att arbetsytan finns.
 */

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`omdirigering till ${to}`), { redirectTo: to });
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? "198.51.100.42" : null),
  }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

vi.mock("@/lib/auth", () => ({ signIn: async () => {}, SIGNUP_METHOD: "signup" }));

vi.mock("@/lib/login-ticket", () => ({
  issueTicket: async () => {},
  rawTicket: async () => "lapp",
  clearTicket: async () => {},
}));

vi.mock("@/lib/email-verification", () => ({
  sendEmailVerification: async () => "sent",
}));

const { register } = await import("@/app/registrera/actions");

const PREFIX = "Takets test ";

function form(index: number): FormData {
  const data = new FormData();
  data.set("firstName", "Anna");
  data.set("lastName", "Andersson");
  data.set("email", `tak-${index}-${Math.random().toString(36).slice(2, 8)}@example.com`);
  data.set("phone", "070-123 45 67");
  data.set("companyName", `${PREFIX}${index}`);
  data.set("password", "ett-langt-losenord");
  data.set("repeat", "ett-langt-losenord");
  return data;
}

/** Kör åtgärden. En omdirigering betyder att arbetsytan skapades. */
async function attempt(index: number): Promise<"skapad" | "nekad"> {
  try {
    await register({}, form(index));
    return "nekad";
  } catch (error) {
    if ((error as { redirectTo?: string }).redirectTo) return "skapad";
    throw error;
  }
}

beforeEach(async () => {
  await __resetThrottle();
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: PREFIX } },
  });
});

afterAll(async () => {
  await __resetThrottle();
  await unsafeGlobalPrisma.$disconnect();
});

describe("tak på nya arbetsytor per IP-adress", () => {
  it("åtta samtidiga registreringar ger fem arbetsytor", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => attempt(index))
    );

    expect(results.filter((result) => result === "skapad")).toHaveLength(5);
    expect(
      await unsafeGlobalPrisma.company.count({
        where: { name: { startsWith: PREFIX } },
      })
    ).toBe(5);
  });

  it("ett fel i fälten räknas inte mot taket", async () => {
    for (let index = 0; index < 6; index += 1) {
      const data = form(index);
      data.set("lastName", "");
      expect((await register({}, data)).error).toBeTruthy();
    }

    expect(await attempt(99)).toBe("skapad");
  });
});
