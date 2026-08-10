import { unsafeGlobalPrisma } from "./db";

/**
 * MULTI-TENANT-LAGRET — systemets viktigaste säkerhetskod.
 *
 * Problemet: alla kundföretag delar samma databas. Om en enda kodrad någonstans
 * glömmer att filtrera på company_id kan kund A se kund B:s tidrapporter. Det
 * är den värsta bugg det här systemet kan ha.
 *
 * Lösningen: ingen kod i appen får prata med databasen direkt. All åtkomst går
 * via `forCompany(companyId)`, som lämnar tillbaka en databasklient där
 * filtreringen redan är inbakad. Den som skriver `db.employee.findMany()` får
 * automatiskt bara det inloggade företagets anställda — även om hen inte tänkte
 * på det. Filtret går inte att glömma, eftersom det inte är något man skriver.
 *
 * Konkret sker tre saker automatiskt:
 *   1. Läsningar får `WHERE company_id = ...` påtvingat
 *   2. Nya rader får rätt company_id påstämplat
 *   3. Råa SQL-frågor blockeras helt (de går inte att filtrera automatiskt)
 *
 * Bevisas av tests/tenant-isolation.test.ts.
 */

/**
 * Alla modeller som innehåller kunddata. `Company` står avsiktligt inte med —
 * den ÄR tenanten och har ingen egen company_id-kolumn.
 *
 * Lägger du till en ny tabell i schema.prisma måste den läggas till här.
 * Testet `alla kundnära modeller är skyddade` går sönder om du glömmer.
 */
export const TENANT_SCOPED_MODELS = [
  "Employee",
  "Order",
  "WorkMoment",
  "TimeEntry",
  "AdminUser",
  "KioskDevice",
] as const;

const TENANT_MODEL_SET: ReadonlySet<string> = new Set(TENANT_SCOPED_MODELS);

/** Kastas när något försöker kringgå filtreringen. */
export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

type AnyArgs = Record<string, unknown>;

function mergeWhere(args: AnyArgs | undefined, companyId: string): AnyArgs {
  const next = { ...(args ?? {}) };
  const existing = (next.where ?? {}) as Record<string, unknown>;

  // companyId läggs sist och skriver över allt anropande kod råkat skicka in.
  // Det är avsiktligt: ingen ska kunna be om ett annat företags data.
  next.where = { ...existing, companyId };
  return next;
}

function stampCompanyOnData(data: unknown, companyId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as object), companyId }));
  }
  if (data && typeof data === "object") {
    return { ...(data as object), companyId };
  }
  return data;
}

/**
 * Ger en databasklient som är permanent låst till ett företag.
 *
 * @param companyId id:t för det inloggade företaget (eller kioskens företag)
 */
export function forCompany(companyId: string) {
  if (!companyId || typeof companyId !== "string") {
    throw new TenantIsolationError(
      "forCompany() anropades utan giltigt companyId. Detta är alltid en bugg — " +
        "utan företags-id går det inte att avgöra vems data som får läsas."
    );
  }

  return unsafeGlobalPrisma.$extends({
    name: `tenant:${companyId}`,

    client: {
      /** Företaget den här klienten är låst till. Bra vid felsökning. */
      $companyId: companyId,

      // Råa SQL-frågor kan vi inte filtrera automatiskt — de är fri text.
      // Därför blockeras de helt på den här klienten.
      $queryRaw() {
        throw new TenantIsolationError(
          "Rå SQL är blockerad på en företagslåst klient, eftersom filtreringen " +
            "på company_id inte kan garanteras. Använd Prismas vanliga metoder."
        );
      },
      $executeRaw() {
        throw new TenantIsolationError(
          "Rå SQL är blockerad på en företagslåst klient, eftersom filtreringen " +
            "på company_id inte kan garanteras. Använd Prismas vanliga metoder."
        );
      },
      $queryRawUnsafe() {
        throw new TenantIsolationError("Rå SQL är blockerad på en företagslåst klient.");
      },
      $executeRawUnsafe() {
        throw new TenantIsolationError("Rå SQL är blockerad på en företagslåst klient.");
      },
    },

    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Company-tabellen och allt utanför listan lämnas orört.
          if (!TENANT_MODEL_SET.has(model)) {
            return query(args);
          }

          const a = (args ?? {}) as AnyArgs;

          switch (operation) {
            // findUnique letar bara på unika kolumner och accepterar inte ett
            // extra company_id-filter. Vi skriver om anropet till findFirst,
            // som gör samma sak men tillåter filtret. Anroparen märker inget.
            case "findUnique":
              return query(mergeWhere(a, companyId), { operation: "findFirst" } as never);

            case "findUniqueOrThrow":
              return query(mergeWhere(a, companyId), {
                operation: "findFirstOrThrow",
              } as never);

            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany":
            case "update":
            case "delete":
              return query(mergeWhere(a, companyId));

            case "create":
              return query({ ...a, data: stampCompanyOnData(a.data, companyId) });

            case "createMany":
            case "createManyAndReturn":
              return query({ ...a, data: stampCompanyOnData(a.data, companyId) });

            case "upsert":
              return query({
                ...mergeWhere(a, companyId),
                create: stampCompanyOnData(a.create, companyId),
              });

            default:
              // Okänd operation → vi vet inte hur den filtreras. Vägra hellre
              // än att råka släppa igenom en ofiltrerad fråga.
              throw new TenantIsolationError(
                `Okänd databasoperation "${operation}" på modellen "${model}". ` +
                  "Den måste hanteras uttryckligen i src/lib/tenant.ts innan den kan användas."
              );
          }
        },
      },
    },
  });
}

/** Typen för en företagslåst databasklient. Använd i funktionssignaturer. */
export type CompanyDb = ReturnType<typeof forCompany>;
