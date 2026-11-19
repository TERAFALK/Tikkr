import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * VARJE RUTT UNDER /api/gateway KRÄVER GATEWAYENS NYCKEL.
 *
 * Rutterna ligger utanför panelen och når kundens kunder och ordrar. En ny
 * rutt som glömt withGateway() vore en öppen väg in, och den syns inte i en
 * granskning av en diff som bara lägger till en fil. Därför letas de upp här.
 *
 * Undantagen står med skäl.
 */

const root = path.resolve(__dirname, "..", "src", "app", "api", "gateway");

const EXCEPTIONS: Record<string, string> = {
  "v1/register/route.ts": "Löser in engångstoken; har ingen nyckel än. Bromsad per IP.",
  "v1/openapi.json/route.ts": "Beskriver bara formen på API:t.",
};

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("gateway-API:t", () => {
  const files = routes(root).map((f) => path.relative(root, f).split(path.sep).join("/"));

  it("har rutter att pröva", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(files.filter((f) => !(f in EXCEPTIONS)))("%s går genom withGateway()", (file) => {
    const source = readFileSync(path.join(root, file), "utf8");
    const handlers = source.match(/export (async )?function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
    const guarded = source.match(/return withGateway\(request,/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(handlers.length);
  });

  it("undantagen finns", () => {
    for (const file of Object.keys(EXCEPTIONS)) expect(files).toContain(file);
  });

  it("ingen rutt läser företaget ur begäran", () => {
    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/companyId\s*[:=]\s*(body|request|params|searchParams)/);
    }
  });
});
