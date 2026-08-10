import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TENANT_SCOPED_MODELS } from "@/lib/tenant";

/**
 * Skyddsnät mot den lättaste tabben att göra: någon lägger till en ny tabell
 * i schema.prisma men glömmer registrera den i tenant.ts. Då skulle den
 * tabellen sakna företagsfiltrering — helt tyst, utan felmeddelande.
 *
 * Det här testet behöver ingen databas. Det läser bara schemafilen.
 */

const schema = readFileSync(
  path.resolve(__dirname, "../prisma/schema.prisma"),
  "utf8"
);

function modelsInSchema(): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

function bodyOfModel(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  const end = schema.indexOf("\n}", start);
  return schema.slice(start, end);
}

describe("multi-tenant: alla kundnära modeller är registrerade", () => {
  it("varje modell med company_id finns i TENANT_SCOPED_MODELS", () => {
    const unprotected = modelsInSchema().filter(
      (name) =>
        /companyId\s+String/.test(bodyOfModel(name)) &&
        !TENANT_SCOPED_MODELS.includes(name as never)
    );

    expect(
      unprotected,
      `Dessa modeller har company_id men saknas i TENANT_SCOPED_MODELS i ` +
        `src/lib/tenant.ts. Utan registrering filtreras de INTE på företag, ` +
        `vilket betyder att en kund kan läsa en annan kunds data. Lägg till dem.`
    ).toEqual([]);
  });

  it("varje registrerad modell finns faktiskt i schemat", () => {
    const existing = modelsInSchema();
    const missing = TENANT_SCOPED_MODELS.filter((m) => !existing.includes(m));

    expect(
      missing,
      "Dessa modeller är registrerade i tenant.ts men finns inte i schema.prisma."
    ).toEqual([]);
  });

  it("Company är inte registrerad — den är tenanten, inte en tenant-ägd tabell", () => {
    expect(TENANT_SCOPED_MODELS).not.toContain("Company" as never);
  });
});
