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

/**
 * Modeller som har company_id men INTE ska tenant-filtreras.
 *
 * Varje rad här är ett hål i det automatiska skyddet och måste därför ha ett
 * skäl som håller. Listan är med flit kort och svår att utöka av slarv: den som
 * lägger till ett namn får skriva varför.
 *
 * SupportVisit: raden beskriver LEVERANTÖRENS åtkomst till en kund, inte
 * kundens egen data. Den skapas av plattformspanelen och läses bara där. Låg
 * den i filtreringslagret skulle en supportsession kunna läsa sina egna
 * besöksrader genom kundens klient — och i läsläge inte kunna skapa dem alls,
 * vilket är just det spår besöket måste lämna.
 */
const DELIBERATELY_UNSCOPED = ["SupportVisit"];

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
        !TENANT_SCOPED_MODELS.includes(name as never) &&
        !DELIBERATELY_UNSCOPED.includes(name)
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

  it("varje undantag finns i schemat och är inte registrerat", () => {
    // Ett undantag som pekar på en borttagen modell är ett hål som står kvar
    // och väntar på nästa modell med samma namn. Ett som ÄR registrerat är
    // bara vilseledande.
    const existing = modelsInSchema();

    for (const name of DELIBERATELY_UNSCOPED) {
      expect(existing, `${name} finns inte i schema.prisma`).toContain(name);
      expect(
        TENANT_SCOPED_MODELS,
        `${name} står både som undantag och som registrerad`
      ).not.toContain(name as never);
    }
  });
});
