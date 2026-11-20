import { z } from "zod";
import type { IntegrationProvider } from "../provider";

/**
 * VISMA ADMINISTRATION (500/1000/2000), via Tikkr Gateway.
 *
 * Visma Administration har ingen molnåtkomst. Gatewayen läser företaget med
 * Vismas ADK på kundens server och skickar posterna hit i formen nedan.
 *
 * Formen är VÅR, inte Vismas: gatewayens Visma-källa översätter ADK:s fält
 * till den. Det är kontraktet mellan de två repona, och klassen i gatewayen
 * genereras ur samma schema via OpenAPI-specen. Fält läggs till, aldrig tas
 * bort inom v1.
 */

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullish();

export const vismaCustomerSchema = z
  .object({
    customerNumber: text(50).min(1),
    name: text(200).min(1),
    orgNumber: optionalText(50),
    contactName: optionalText(200),
    email: optionalText(200),
    phone: optionalText(50),
    addressLine: optionalText(200),
    postalCode: optionalText(20),
    city: optionalText(100),
  })
  .meta({ id: "VismaAdministrationCustomer" });

export const vismaOrderSchema = z
  .object({
    orderNumber: text(50).min(1),
    customerNumber: optionalText(50),
    /** open, delivered (levererad, ej fakturerad), invoiced eller cancelled (makulerad). */
    status: optionalText(50),
    orderDate: z.iso.date().nullish(),
    deliveryDate: z.iso.date().nullish(),
  })
  .meta({ id: "VismaAdministrationOrder" });

export const vismaSettingsSchema = z.object({
  /** Visma-företaget att läsa, som gatewayen rapporterade det. */
  companyKey: z.string().min(1).nullable().default(null),
  entities: z.array(z.enum(["customers", "orders"])).default(["customers", "orders"]),
  /**
   * Orderstatusar som tas med: open, delivered, invoiced, cancelled. Bara
   * öppna som standard (produktägarens val 2026-11-19): en levererad order är
   * klar att faktureras och ska inte få ny tid.
   */
  orderStatuses: z.array(z.string()).default(["open"]),
  /** true: ny kund utan träff skapas direkt. false: den hamnar i inkorgen. */
  createCustomers: z.boolean().default(false),
});

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue?.path.join(".") || "posten";
  return `Ogiltigt fält: ${field}.`;
}

export const vismaAdministration: IntegrationProvider<typeof vismaSettingsSchema> = {
  id: "visma-administration",
  name: "Visma Administration",
  description: "Kunder från 500, 1000 och 2000. Ordrar från 1000 och 2000.",
  mark: "VA",
  logo: "/integrationer/visma.svg",
  connectionType: "gateway",
  gatewaySource: "visma-administration",
  entities: ["customers", "orders"],
  settingsSchema: vismaSettingsSchema,
  settingsFields: [
    { key: "companyKey", label: "Företag i Visma", kind: "select", optionsFrom: "gateway-instances" },
    {
      key: "entities",
      label: "Synka",
      kind: "multi-select",
      options: [
        { value: "customers", label: "Kunder" },
        { value: "orders", label: "Ordrar" },
      ],
    },
    {
      key: "createCustomers",
      label: "Skapa nya kunder direkt",
      kind: "boolean",
      help: "Annars hamnar de i inkorgen",
    },
  ],
  sourceOptions(settings) {
    return {
      instanceKey: settings.companyKey,
      entities: settings.entities,
      options: { orderStatuses: settings.orderStatuses },
    };
  },
  includeOrder(settings, order) {
    // Gatewayen skickar open, delivered, invoiced eller cancelled. Saknas
    // statusen räknas ordern som öppen.
    return settings.orderStatuses.includes(order.sourceStatus ?? "open");
  },
  createCustomers(settings) {
    return settings.createCustomers;
  },
  mapCustomer(data) {
    const parsed = vismaCustomerSchema.safeParse(data);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const c = parsed.data;
    return {
      ok: true,
      value: {
        name: c.name,
        customerNumber: clean(c.customerNumber),
        orgNumber: clean(c.orgNumber),
        contactName: clean(c.contactName),
        email: clean(c.email),
        phone: clean(c.phone),
        addressLine: clean(c.addressLine),
        postalCode: clean(c.postalCode),
        city: clean(c.city),
      },
    };
  },
  mapOrder(data) {
    const parsed = vismaOrderSchema.safeParse(data);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const o = parsed.data;
    return {
      ok: true,
      value: {
        orderNumber: o.orderNumber,
        // Kundnumret ÄR kundens id i Visma, se gatewayens Visma-källa.
        customerExternalId: clean(o.customerNumber),
        sourceStatus: clean(o.status),
      },
    };
  },
  recordSchemas: { customers: vismaCustomerSchema, orders: vismaOrderSchema },
};
