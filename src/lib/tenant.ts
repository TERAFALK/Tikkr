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
 * Konkret sker två saker automatiskt:
 *   1. Läsningar och ändringar får `WHERE company_id = ...` påtvingat
 *   2. Anrop som pekar ut ett ANNAT företag avvisas med ett fel
 *
 * Vid `create` måste companyId anges uttryckligen — Prismas typer kräver det,
 * och det är bra: TypeScript ser till att du inte glömmer, och det här lagret
 * ser till att du inte anger fel. Kompilatorn och säkerheten drar åt samma håll.
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
  "AdminInvite",
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

/**
 * Vägrar om koden uttryckligen pekar ut ett annat företag.
 *
 * Att göra det är alltid ett fel — antingen en bugg eller ett angreppsförsök.
 * Vi skulle kunna byta ut värdet tyst och returnera det egna företagets data,
 * men då göms buggen. Bättre att säga ifrån direkt.
 */
function rejectForeignCompanyId(value: unknown, companyId: string, where: string) {
  if (value !== undefined && value !== companyId) {
    throw new TenantIsolationError(
      `Försök att ${where} med companyId "${String(value)}" från en klient låst ` +
        `till "${companyId}". Ta bort companyId ur anropet — filtreringen sköts ` +
        `automatiskt av forCompany().`
    );
  }
}

function mergeWhere(args: AnyArgs | undefined, companyId: string): AnyArgs {
  const next = { ...(args ?? {}) };
  const existing = (next.where ?? {}) as Record<string, unknown>;

  rejectForeignCompanyId(existing.companyId, companyId, "söka");

  next.where = { ...existing, companyId };
  return next;
}

function stampCompanyOnData(data: unknown, companyId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => {
      rejectForeignCompanyId(
        (row as Record<string, unknown>)?.companyId,
        companyId,
        "skriva"
      );
      return { ...(row as object), companyId };
    });
  }
  if (data && typeof data === "object") {
    rejectForeignCompanyId(
      (data as Record<string, unknown>).companyId,
      companyId,
      "skriva"
    );
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
    },

    // OBS: Prisma tillåter inte att inbyggda metoder skrivs över i en
    // extension, så $queryRaw och $executeRaw går INTE att blockera här.
    // Rå SQL kringgår därmed företagsfiltreringen helt.
    //
    // Regel: skriv aldrig rå SQL mot kunddata. Behövs det ändå — t.ex. för en
    // tung rapportfråga i Fas 2 — måste "WHERE company_id = ..." skrivas ut
    // för hand och granskas extra noga.

    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Company-tabellen och allt utanför listan lämnas orört.
          if (!TENANT_MODEL_SET.has(model)) {
            return query(args);
          }

          const a = (args ?? {}) as AnyArgs;
          // Prismas typ för query() är snävare än de argument vi bygger om
          // dynamiskt. Omvägen via unknown gör att TypeScript släpper igenom
          // det utan att vi tappar kontrollen — vi vet vad vi skickar in.
          const run = query as unknown as (args: unknown) => Promise<unknown>;

          switch (operation) {
            // findUnique letar bara på unika kolumner (som id) och accepterar
            // inget extra company_id-filter i frågan. Därför kontrollerar vi
            // efteråt istället: hämta raden, och lämna bara ut den om den
            // tillhör rätt företag. Raden lämnar aldrig det här lagret annars,
            // så ingen data kan läcka.
            case "findUnique":
            case "findUniqueOrThrow": {
              // Om anroparen bett om utvalda kolumner måste vi se till att
              // companyId följer med, annars går den inte att kontrollera.
              // Den plockas bort igen innan svaret lämnas tillbaka, så
              // anroparen får exakt det den bad om.
              const select = a.select as Record<string, unknown> | undefined;
              const addedCompanyId = Boolean(select) && !select!.companyId;

              const row = (await run(
                addedCompanyId ? { ...a, select: { ...select, companyId: true } } : a
              )) as Record<string, unknown> | null;

              if (!row || row.companyId !== companyId) {
                if (operation === "findUniqueOrThrow") {
                  throw new TenantIsolationError(
                    `Ingen rad i ${model} med de angivna villkoren för det här företaget.`
                  );
                }
                return null;
              }

              if (addedCompanyId) delete row.companyId;
              return row;
            }

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
              return run(mergeWhere(a, companyId));

            case "create":
            case "createMany":
            case "createManyAndReturn":
              return run({ ...a, data: stampCompanyOnData(a.data, companyId) });

            case "upsert":
              return run({
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
