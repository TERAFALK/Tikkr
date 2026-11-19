"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { saved, type SaveState } from "@/lib/save-state";
import { providerById } from "@/lib/integrations/providers";
import { createRegistrationToken } from "@/lib/integrations/gateway-auth";
import {
  createCustomerFromMapping,
  ignoreMapping,
  linkToExistingCustomer,
  unlinkMapping,
} from "@/lib/integrations/mappings";
import type { DialogState } from "@/components/ui/ActionDialog";

/**
 * SERVERÅTGÄRDERNA UNDER INSTÄLLNINGAR, INTEGRATIONER.
 *
 * Varje åtgärd kallar requireAdmin() och assertWritable(), och tar företaget
 * ur sessionen. Ett id ur ett formulär slås upp genom företagets egen klient
 * och kan aldrig peka på en annan arbetsytas rad.
 */

const BASE = "/admin/installningar/integrationer";

function refresh(provider?: string) {
  revalidatePath(BASE);
  if (provider) revalidatePath(`${BASE}/${provider}`);
}

/** Lägger till en integration och går till dess sida. */
export async function addIntegration(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId, email } = session;

  const provider = providerById(String(formData.get("provider") ?? ""));
  if (!provider) return;

  const existing = await db.integration.findFirst({ where: { provider: provider.id }, select: { id: true } });
  if (!existing) {
    // Finns exakt en gateway i arbetsytan betjänar den också den nya
    // integrationen. Med flera väljs den när den registreras eller i panelen.
    const gateways = provider.connectionType === "gateway"
      ? await db.gateway.findMany({ select: { id: true }, take: 2 })
      : [];
    await db.integration.create({
      data: {
        companyId,
        provider: provider.id,
        connectionType: provider.connectionType === "gateway" ? "GATEWAY" : "OAUTH",
        gatewayId: gateways.length === 1 ? gateways[0].id : null,
        settings: provider.settingsSchema.parse({}) as object,
        createdByEmail: email,
      },
    });
    await db.integrationEvent.create({
      data: { companyId, message: `${provider.name} tillagd.`, details: { actor: email } },
    });
  }

  refresh(provider.id);
  redirect(`${BASE}/${provider.id}`);
}

/**
 * Tar bort integrationen. Kopplingar, rådata och logg följer med; kunderna och
 * ordrarna i Tikkr står kvar orörda.
 */
export async function removeIntegration(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId, email } = session;

  const provider = providerById(String(formData.get("provider") ?? ""));
  if (!provider) return;
  await db.integration.deleteMany({ where: { provider: provider.id } });
  await db.integrationEvent.create({
    data: { companyId, message: `${provider.name} borttagen.`, details: { actor: email } },
  });

  refresh(provider.id);
  redirect(BASE);
}

/** Sparar integrationens inställningar, validerade mot providerns schema. */
export async function saveIntegrationSettings(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const provider = providerById(String(formData.get("provider") ?? ""));
  if (!provider) return { error: "Okänd integration." };

  const input: Record<string, unknown> = {};
  for (const field of provider.settingsFields) {
    if (field.kind === "boolean") input[field.key] = formData.get(field.key) === "on";
    else if (field.kind === "multi-select") input[field.key] = formData.getAll(field.key).map(String);
    else {
      const value = String(formData.get(field.key) ?? "").trim();
      input[field.key] = value === "" ? null : value;
    }
  }

  const integration = await db.integration.findFirst({ where: { provider: provider.id } });
  if (!integration) return { error: "Integrationen finns inte." };

  // Fält som inte står i formuläret behåller sitt värde, t.ex. orderstatusarna.
  const parsed = provider.settingsSchema.safeParse({ ...(integration.settings as object), ...input });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: "Ett av valen är ogiltigt.", field: String(issue?.path[0] ?? "") };
  }

  await db.integration.updateMany({ where: { id: integration.id }, data: { settings: parsed.data as object } });
  refresh(provider.id);
  return saved();
}

/** Ber gatewayen synka nu, eller läsa om allt från början. */
export async function requestSync(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId, email } = session;

  const provider = providerById(String(formData.get("provider") ?? ""));
  const full = formData.get("full") === "1";
  const integration = provider
    ? await db.integration.findFirst({ where: { provider: provider.id }, select: { id: true, gatewayId: true } })
    : null;
  if (!integration) return { error: "Integrationen finns inte." };
  if (!integration.gatewayId) return { error: "Ingen gateway är ansluten. Installera Tikkr Gateway under Anslutning." };

  await db.gatewayCommand.create({
    data: {
      companyId,
      gatewayId: integration.gatewayId,
      integrationId: integration.id,
      type: full ? "FULL_RESYNC" : "SYNC_NOW",
      createdByEmail: email,
    },
  });
  refresh(provider?.id);
  return saved(full ? "Omläsningen är begärd." : "Synken är begärd.");
}

export interface TokenState extends DialogState {
  token?: string;
  expiresAt?: string;
}

/** Skapar en registreringstoken. Den visas en gång och sparas bara som fingeravtryck. */
export async function createGatewayToken(_previous: TokenState, _formData: FormData): Promise<TokenState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { token, expiresAt } = await createRegistrationToken(session.companyId, session.email);
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Kopplar från en gateway. Dess nyckel slutar gälla direkt. */
export async function disconnectGateway(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId, email } = session;

  const id = String(formData.get("id") ?? "");
  const gateway = await db.gateway.findFirst({ where: { id }, select: { id: true, machineName: true } });
  if (!gateway) return;
  await db.gateway.deleteMany({ where: { id: gateway.id } });
  await db.integrationEvent.create({
    data: {
      companyId,
      message: `Gatewayen på ${gateway.machineName ?? "okänd dator"} är frånkopplad.`,
      details: { actor: email },
    },
  });
  refresh(String(formData.get("provider") ?? "") || undefined);
}

/* -------------------------------------------------------------------------- */
/* Inkorgen                                                                    */
/* -------------------------------------------------------------------------- */

export async function linkMapping(_previous: DialogState, formData: FormData): Promise<DialogState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return { error: "Välj en kund.", field: "customerId" };

  const result = await linkToExistingCustomer(session.db, {
    mappingId: String(formData.get("mappingId") ?? ""),
    customerId,
    actorEmail: session.email,
  });
  if (!result.ok) return { error: result.error };
  refresh(String(formData.get("provider") ?? "") || undefined);
  return { ok: "Kunden är kopplad." };
}

export async function createFromMapping(_previous: DialogState, formData: FormData): Promise<DialogState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const result = await createCustomerFromMapping(session.db, {
    mappingId: String(formData.get("mappingId") ?? ""),
    actorEmail: session.email,
  });
  if (!result.ok) return { error: result.error };
  refresh(String(formData.get("provider") ?? "") || undefined);
  return { ok: "Kunden är skapad." };
}

export async function ignoreMappingAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  await assertWritable(session);
  await ignoreMapping(session.db, { mappingId: String(formData.get("mappingId") ?? ""), actorEmail: session.email });
  refresh(String(formData.get("provider") ?? "") || undefined);
}

export async function unlinkMappingAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  await assertWritable(session);
  await unlinkMapping(session.db, { mappingId: String(formData.get("mappingId") ?? ""), actorEmail: session.email });
  refresh(String(formData.get("provider") ?? "") || undefined);
}
