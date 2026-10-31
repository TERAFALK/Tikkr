import { Prisma } from "@prisma/client";
import { tenantExtension } from "@terafalk/core/tenant";
import { unsafeGlobalPrisma } from "./db";

export { ReadOnlyError, TenantIsolationError } from "@terafalk/core/tenant";

/**
 * MULTI-TENANT-LAGRET. Reglerna ligger i @terafalk/core, se tf-framework. Här står
 * vad som är Tikkrs: vilka modeller som är kunddata.
 *
 * Bevisas av tests/tenant-isolation.test.ts och tests/tenant-writes.test.ts.
 */

/**
 * Alla modeller som innehåller kunddata. `Company` står avsiktligt inte med: den
 * ÄR tenanten och har ingen egen company_id-kolumn.
 *
 * Lägger du till en ny tabell i schema.prisma måste den läggas till här.
 * Testet `alla kundnära modeller är skyddade` går sönder om du glömmer.
 */
export const TENANT_SCOPED_MODELS = [
  "Employee",
  "Customer",
  "Order",
  "OrderBudget",
  "WorkMoment",
  "IndirectMoment",
  "TimeEntry",
  "AdminUser",
  "AdminInvite",
  "KioskDevice",
  // Löneunderlaget.
  "WorkSchedule",
  "ScheduleDay",
  "ScheduleBreak",
  "BreakType",
  "BreakEntry",
  "AbsenceReason",
  "Absence",
  "CompAdjustment",
  "Holiday",
  // Planeringen.
  "Station",
  "StationDay",
  "StationBreak",
  "PlannedBlock",
  "StaffBlock",
  // Tillvalen. Se company-modules.ts — skrivningarna sker via
  // unsafeGlobalPrisma, men raderna hör till kunden och filtreras därför här.
  "CompanyModule",
  // Avtalat pris per kund. Skrivs bara av plattformspanelen, men LÄSES av
  // kundens egen prenumerationssida — och kund A ska aldrig kunna läsa vad
  // kund B förhandlat fram.
  "CompanyPrice",
  // Skärminställningar per kund. Skrivs bara av plattformspanelen, och läses
  // av kundens egna skärmar.
  "CompanyKioskSetting",
  // Ändringsloggen. Kundens egen historik, och lika isolerad som resten.
  "AuditEvent",
  // Fel och förslag. Kunden skriver sina meddelanden här; plattformens
  // inkorg läser och arkiverar via unsafeGlobalPrisma, som för CompanyPrice.
  // Ett meddelande om ett fel säger mycket om en kunds verksamhet, och kund A
  // ska aldrig se vad kund B skrivit till oss.
  "FeedbackMessage",
  // Tillbehören. Leveransuppgifterna och beställningarna är kundens, och
  // plattformens beställningssida läser dem via unsafeGlobalPrisma, som
  // inkorgen. De interna anteckningarna och priset (ShopOrderNote,
  // ShopPrice) är plattformens och har ingen company_id.
  "CompanyProfile",
  "ShopOrder",
  "ShopOrderLine",
  "ShopOrderEvent",
] as const;

export interface CompanyDbOptions {
  /** true ger en klient som vägrar skriva. Används av supportläget. */
  readOnly?: boolean;
}

/**
 * Ger en databasklient som är permanent låst till ett företag.
 *
 * @param companyId id:t för det inloggade företaget (eller kioskens företag)
 * @param options `readOnly` ger en klient utan skrivrätt
 */
export function forCompany(companyId: string, options: CompanyDbOptions = {}) {
  return unsafeGlobalPrisma.$extends(
    tenantExtension({
      tenantId: companyId,
      models: TENANT_SCOPED_MODELS,
      datamodel: Prisma.dmmf.datamodel,
      readOnly: options.readOnly,
      readOnlyMessage:
        "Supportläget får bara läsa. Be kunden göra ändringen, eller logga in " +
        "som dem själva med deras medgivande.",
      client: { $companyId: companyId },
    })
  );
}

/** Typen för en företagslåst databasklient. Använd i funktionssignaturer. */
export type CompanyDb = ReturnType<typeof forCompany>;
