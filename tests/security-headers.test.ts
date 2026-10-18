import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

/**
 * SÄKERHETSHUVUDENA (2026-10-18).
 *
 * Läser dem ur next.config.ts, där de sätts, så att en ändring som tar bort
 * ett direktiv eller låter policyn gälla PDF-svaren fälls här och inte i
 * produktionen. Behöver ingen databas.
 */

async function rules() {
  if (!nextConfig.headers) throw new Error("next.config.ts sätter inga headers.");
  return nextConfig.headers();
}

async function policy(): Promise<{ source: string; value: string }> {
  for (const rule of await rules()) {
    const header = rule.headers.find((h) => h.key === "Content-Security-Policy");
    if (header) return { source: rule.source, value: header.value };
  }
  throw new Error("Ingen Content-Security-Policy.");
}

function directive(value: string, name: string): string | undefined {
  return value
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

describe("Content-Security-Policy", () => {
  it("stoppar plugins, en främmande bas och ramar utifrån", async () => {
    const { value } = await policy();

    expect(directive(value, "object-src")).toBe("object-src 'none'");
    expect(directive(value, "base-uri")).toBe("base-uri 'self'");
    expect(directive(value, "frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive(value, "default-src")).toBe("default-src 'self'");
  });

  it("skript och anrop bara från egen adress", async () => {
    const { value } = await policy();

    // Inga externa källor. 'unsafe-inline' är valt, se next.config.ts.
    expect(directive(value, "script-src")).not.toMatch(/https?:|\*/);
    expect(directive(value, "connect-src")).not.toMatch(/https?:|\*/);
  });

  it("formulär går bara hit och till Stripes kassa och kundportal", async () => {
    const { value } = await policy();

    expect(directive(value, "form-action")).toBe(
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com"
    );
  });

  it("gäller sidorna men inte /api", async () => {
    // Ett PDF-svar med object-src 'none' kan sluta visas i webbläsarens egen
    // PDF-visare, som utskriftsknappen använder.
    const { source } = await policy();
    const pattern = new RegExp(`^${source.replace(/^\//, "\\/")}$`);

    expect(pattern.test("/admin/rapporter")).toBe(true);
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/api/admin/export/orders")).toBe(false);
  });

  it("de äldre huvudena står kvar för alla svar", async () => {
    const all = (await rules()).find((rule) => rule.source === "/:path*");
    const keys = all?.headers.map((h) => h.key) ?? [];

    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Strict-Transport-Security",
      ])
    );
  });
});
