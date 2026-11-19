import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildGatewayOpenApi } from "@/lib/integrations/gateway-openapi";

/**
 * OPENAPI-SPECEN FÖR GATEWAY-API:T.
 *
 * Den sparade filen är vad gatewayens klient genereras ur. Ändras ett schema
 * utan att filen följer med, bygger gatewayen mot ett API som inte längre
 * finns. Testet fäller det.
 *
 * Skriv om filen (och kopian i ../tikkr-gateway/api om repot ligger bredvid):
 *
 *   UPDATE_OPENAPI=1 npx vitest run tests/gateway-openapi.test.ts
 */

const root = path.resolve(__dirname, "..");
const saved = path.join(root, "openapi", "gateway-v1.json");
const gatewayCopy = path.join(root, "..", "tikkr-gateway", "api", "openapi.json");

const spec = buildGatewayOpenApi();
const text = JSON.stringify(spec, null, 2) + "\n";

if (process.env.UPDATE_OPENAPI) {
  mkdirSync(path.dirname(saved), { recursive: true });
  writeFileSync(saved, text);
  if (existsSync(path.dirname(path.dirname(gatewayCopy)))) {
    mkdirSync(path.dirname(gatewayCopy), { recursive: true });
    writeFileSync(gatewayCopy, text);
  }
}

describe("OpenAPI för gateway-API:t", () => {
  it("den sparade filen stämmer med koden", () => {
    expect(readFileSync(saved, "utf8").replace(/\r\n/g, "\n")).toBe(text);
  });

  it("varje referens pekar på ett schema som finns", () => {
    const refs = [...text.matchAll(/"\$ref": "#\/components\/schemas\/([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const id of refs) expect(spec.components.schemas).toHaveProperty(id);
  });

  it("källornas poster står med, så att gatewayen kan generera dem", () => {
    expect(spec.components.schemas).toHaveProperty("VismaAdministrationCustomer");
    expect(spec.components.schemas).toHaveProperty("VismaAdministrationOrder");
  });

  it("bara registreringen går utan nyckel", () => {
    for (const [route, ops] of Object.entries(spec.paths)) {
      for (const op of Object.values(ops) as { security?: unknown[] }[]) {
        expect(op.security === undefined || route === "/register").toBe(true);
      }
    }
  });
});
