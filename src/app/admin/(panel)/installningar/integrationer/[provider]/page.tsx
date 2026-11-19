import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { companyTimeZone } from "@/lib/company";
import { formatDateTime } from "@/lib/format";
import { listPaging } from "@/lib/paging";
import {
  countMappings,
  customerMappingPage,
  gatewayRows,
  integrationDetail,
  PENDING_REASON_TEXT,
  SUGGESTION_REASON_TEXT,
  type IntegrationDetail,
  type MappingView,
} from "@/lib/integrations/panel";
import { GATEWAY_STATE_LABEL } from "@/lib/integrations/status";
import { GATEWAY_RELEASE } from "@/lib/integrations/gateway-release";
import IntegrationStatusBadge from "@/components/admin/IntegrationStatusBadge";
import GatewayTokenDialog from "@/components/admin/GatewayTokenDialog";
import ConfirmButton from "@/components/admin/ConfirmButton";
import SaveForm from "@/components/admin/SaveForm";
import ActionDialog from "@/components/ui/ActionDialog";
import SearchSelect from "@/components/admin/SearchSelect";
import Pager from "@/components/ui/Pager";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  createFromMapping,
  createGatewayToken,
  disconnectGateway,
  ignoreMappingAction,
  linkMapping,
  removeIntegration,
  requestSync,
  saveIntegrationSettings,
  unlinkMappingAction,
} from "../actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "oversikt", label: "Översikt" },
  { key: "installningar", label: "Inställningar" },
  { key: "kopplingar", label: "Kopplingar" },
  { key: "logg", label: "Logg" },
  { key: "anslutning", label: "Anslutning" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type Params = { flik?: string; vy?: string; sida?: string; antal?: string };

export const metadata = { title: "Integration · Tikkr" };

/**
 * EN INTEGRATION, med samma flikar för alla: översikt, inställningar,
 * kopplingar, logg och anslutning. Fliken står i adressen som `flik`.
 */
export default async function IntegrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<Params>;
}) {
  const { db, companyId } = await requireAdmin();
  const { provider: providerId } = await params;
  const query = await searchParams;

  const detail = await integrationDetail(db, providerId);
  if (!detail) notFound();

  const tab: TabKey = TABS.some((t) => t.key === query.flik) ? (query.flik as TabKey) : "oversikt";
  const base = `/admin/installningar/integrationer/${providerId}`;
  const timeZone = await companyTimeZone(companyId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/admin/installningar/integrationer" className="text-[13px] font-medium text-link hover:underline">
            Integrationer
          </Link>
          <h2 className="text-base font-semibold text-neutral-900">{detail.provider.name}</h2>
        </div>
        <IntegrationStatusBadge state={detail.status.state} />
      </div>

      <nav aria-label={detail.provider.name} className="flex gap-1 overflow-x-auto border-b border-neutral-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "oversikt" ? base : `${base}?flik=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
              t.key === tab ? "border-fjord text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "oversikt" && <Overview detail={detail} timeZone={timeZone} base={base} />}
      {tab === "installningar" && <Settings detail={detail} />}
      {tab === "kopplingar" && <Mappings detail={detail} query={query} base={base} timeZone={timeZone} />}
      {tab === "logg" && <Log detail={detail} query={query} base={base} timeZone={timeZone} />}
      {tab === "anslutning" && <Connection detail={detail} timeZone={timeZone} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Overview({ detail, timeZone, base }: { detail: IntegrationDetail; timeZone: string; base: string }) {
  const { integration, counts, provider } = detail;
  return (
    <>
      {detail.status.reason && <Alert tone="warning">{detail.status.reason}</Alert>}
      {detail.status.state === "waiting-gateway" && (
        <Alert tone="warning">
          Installera Tikkr Gateway på servern där {provider.name} finns.{" "}
          <Link href={`${base}?flik=anslutning`} className="font-medium underline">
            Anslutning
          </Link>
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Översikt"
          help="integrationer"
          description={
            integration.lastSyncAt ? `Senaste synk ${formatDateTime(integration.lastSyncAt, timeZone)}` : "Inte synkad än"
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Register</Th>
              <Th numeric>Kopplade</Th>
              <Th numeric>I inkorgen</Th>
              <Th numeric>Ignorerade</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>Kunder</Td>
              <Td numeric>{counts.CUSTOMER.linked}</Td>
              <Td numeric>
                {counts.CUSTOMER.pending > 0 ? (
                  <Link href={`${base}?flik=kopplingar`} className="font-medium text-link hover:underline">
                    {counts.CUSTOMER.pending}
                  </Link>
                ) : (
                  0
                )}
              </Td>
              <Td numeric>{counts.CUSTOMER.ignored}</Td>
            </Tr>
          </tbody>
        </Table>
        <div className="flex flex-wrap items-start gap-3 border-t border-neutral-200 px-5 py-4">
          <SaveForm action={requestSync} submitLabel="Synka nu" savedLabel="Begärd" tone="primary">
            <input type="hidden" name="provider" value={provider.id} />
          </SaveForm>
          <SaveForm action={requestSync} submitLabel="Läs om allt" savedLabel="Begärd" tone="secondary">
            <input type="hidden" name="provider" value={provider.id} />
            <input type="hidden" name="full" value="1" />
          </SaveForm>
        </div>
      </Card>

      <Card>
        <CardHeader title="Ta bort integrationen" />
        <form action={removeIntegration} className="flex items-center justify-between gap-4 px-5 py-4">
          <input type="hidden" name="provider" value={provider.id} />
          <p className="text-[13px] text-neutral-600">Kunderna och ordrarna i Tikkr står kvar.</p>
          <ConfirmButton
            type="submit"
            tone="danger"
            question={`Ta bort ${provider.name}? Kopplingarna och loggen tas bort. Kunderna och ordrarna i Tikkr står kvar.`}
          >
            Ta bort
          </ConfirmButton>
        </form>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Settings({ detail }: { detail: IntegrationDetail }) {
  const { provider, integration } = detail;
  return (
    <Card>
      <CardHeader title="Inställningar" />
      <div className="px-5 py-5">
        <SaveForm action={saveIntegrationSettings} submitLabel="Spara">
          <input type="hidden" name="provider" value={provider.id} />
          <div className="space-y-4">
            {provider.settingsFields.map((field) => {
              const value = integration.settings[field.key];
              if (field.kind === "boolean") {
                return (
                  <label key={field.key} className="flex items-start gap-2 text-sm text-neutral-900">
                    <input type="checkbox" name={field.key} defaultChecked={value === true} className="mt-0.5" />
                    <span>
                      {field.label}
                      {field.help && <span className="block text-[13px] text-neutral-500">{field.help}</span>}
                    </span>
                  </label>
                );
              }
              if (field.kind === "multi-select") {
                const chosen = Array.isArray(value) ? value : [];
                return (
                  <fieldset key={field.key}>
                    <legend className="mb-1.5 text-xs font-medium text-neutral-600">{field.label}</legend>
                    <div className="flex flex-wrap gap-4">
                      {field.options.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm text-neutral-900">
                          <input type="checkbox" name={field.key} value={option.value} defaultChecked={chosen.includes(option.value)} />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              }
              const options: { value: string; label: string }[] =
                field.optionsFrom === "gateway-instances"
                  ? detail.instances.map((i) => ({ value: i.key, label: i.name }))
                  : [...(field.options ?? [])];
              const current = typeof value === "string" ? value : "";
              // Ett sparat val som gatewayen inte längre rapporterar står kvar,
              // så att det inte byts tyst när sidan sparas.
              if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current });
              return (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={
                    field.optionsFrom === "gateway-instances" && detail.instances.length === 0
                      ? "Valen visas när gatewayen hört av sig"
                      : field.help
                  }
                >
                  <Select name={field.key} defaultValue={current}>
                    <option value="">Välj</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            })}
          </div>
        </SaveForm>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

const VIEWS: { key: MappingView; label: string }[] = [
  { key: "inkorg", label: "Inkorg" },
  { key: "kopplade", label: "Kopplade" },
  { key: "ignorerade", label: "Ignorerade" },
];

async function Mappings({
  detail,
  query,
  base,
  timeZone,
}: {
  detail: IntegrationDetail;
  query: Params;
  base: string;
  timeZone: string;
}) {
  const { db } = await requireAdmin();
  const view: MappingView = VIEWS.some((v) => v.key === query.vy) ? (query.vy as MappingView) : "inkorg";
  const total = await countMappings(db, detail.integration.id, view);
  const paging = listPaging(total, query);
  const rows = await customerMappingPage(db, detail.integration.id, detail.provider, view, paging);
  const customers =
    view === "inkorg" && rows.length > 0
      ? await db.customer.findMany({
          where: { active: true },
          select: { id: true, name: true, customerNumber: true },
          orderBy: { name: "asc" },
        })
      : [];
  const options = customers.map((c) => ({ id: c.id, label: c.name, hint: c.customerNumber ?? undefined }));
  const provider = detail.provider.id;

  return (
    <Card>
      <CardHeader title="Kopplingar" help="integrationer" />
      <div className="flex gap-1 border-b border-neutral-200 px-5 pb-3">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`${base}?flik=kopplingar&vy=${v.key}${query.antal ? `&antal=${query.antal}` : ""}`}
            aria-current={v.key === view ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-[13px] font-medium ${
              v.key === view ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {v.label}
            {v.key === "inkorg" && detail.counts.CUSTOMER.pending > 0 && ` ${detail.counts.CUSTOMER.pending}`}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={view === "inkorg" ? "Inkorgen är tom" : view === "kopplade" ? "Inga kopplade kunder" : "Inga ignorerade kunder"} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Kund i {detail.provider.name}</Th>
                <Th>{view === "kopplade" ? "Kund i Tikkr" : view === "inkorg" ? "Förslag" : "Senast synkad"}</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.mappingId}>
                  <Td>
                    <span className="font-medium">{row.incoming?.name ?? row.externalId}</span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {[row.externalId, row.incoming?.orgNumber, row.incoming?.city].filter(Boolean).join(" · ")}
                    </span>
                    {row.status === "PENDING" && row.pendingReason && (
                      <span className="mt-1 block">
                        <Badge tone="warning">{PENDING_REASON_TEXT[row.pendingReason] ?? row.pendingReason}</Badge>
                      </span>
                    )}
                  </Td>
                  <Td muted>
                    {view === "kopplade" && row.linked && (
                      <Link href={`/admin/kunder/${row.linked.id}`} className="font-medium text-link hover:underline">
                        {row.linked.name}
                      </Link>
                    )}
                    {view === "inkorg" &&
                      (row.suggestions.length === 0 ? (
                        "Inga"
                      ) : (
                        <ul className="space-y-0.5">
                          {row.suggestions.map((s) => (
                            <li key={s.customerId}>
                              {s.name}{" "}
                              <span className="text-xs text-neutral-500">
                                ({s.reasons.map((r) => SUGGESTION_REASON_TEXT[r] ?? r).join(", ")})
                              </span>
                            </li>
                          ))}
                        </ul>
                      ))}
                    {view === "ignorerade" && (row.lastSyncedAt ? formatDateTime(row.lastSyncedAt, timeZone) : "")}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2 [&_button]:whitespace-nowrap">
                      {row.status === "PENDING" && (
                        <>
                          <ActionDialog
                            trigger="Koppla till befintlig"
                            triggerTone="secondary"
                            title={`Koppla ${row.incoming?.name ?? row.externalId}`}
                            description={`Uppgifterna från ${detail.provider.name} skriver över kundens namn, nummer och adress. Påslag, rabatt och anteckningar står kvar.`}
                            action={linkMapping}
                            initial={{}}
                            submitLabel="Koppla"
                          >
                            <input type="hidden" name="mappingId" value={row.mappingId} />
                            <input type="hidden" name="provider" value={provider} />
                            <Field label="Kund i Tikkr">
                              <SearchSelect
                                name="customerId"
                                options={options}
                                defaultValue={row.suggestions[0]?.customerId ?? null}
                                placeholder="Sök kund"
                                required
                                inDialog
                              />
                            </Field>
                          </ActionDialog>
                          <ActionDialog
                            trigger="Skapa ny"
                            triggerTone="secondary"
                            title={`Skapa ${row.incoming?.name ?? row.externalId}`}
                            description="En ny kund skapas i Tikkr med uppgifterna från källan."
                            action={createFromMapping}
                            initial={{}}
                            submitLabel="Skapa kund"
                          >
                            <input type="hidden" name="mappingId" value={row.mappingId} />
                            <input type="hidden" name="provider" value={provider} />
                          </ActionDialog>
                          <form action={ignoreMappingAction}>
                            <input type="hidden" name="mappingId" value={row.mappingId} />
                            <input type="hidden" name="provider" value={provider} />
                            <Button type="submit" tone="ghost">
                              Ignorera
                            </Button>
                          </form>
                        </>
                      )}
                      {row.status === "LINKED" && (
                        <form action={unlinkMappingAction}>
                          <input type="hidden" name="mappingId" value={row.mappingId} />
                          <input type="hidden" name="provider" value={provider} />
                          <ConfirmButton
                            type="submit"
                            tone="ghost"
                            question={`Koppla loss ${row.incoming?.name ?? row.externalId}? Kunden i Tikkr står kvar, och posten hamnar i inkorgen.`}
                          >
                            Koppla loss
                          </ConfirmButton>
                        </form>
                      )}
                      {row.status === "IGNORED" && (
                        <form action={unlinkMappingAction}>
                          <input type="hidden" name="mappingId" value={row.mappingId} />
                          <input type="hidden" name="provider" value={provider} />
                          <Button type="submit" tone="ghost">
                            Till inkorgen
                          </Button>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager paging={paging} total={total} unit="kunder" path={base} keep={{ flik: "kopplingar", vy: view }} />
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

async function Log({
  detail,
  query,
  base,
  timeZone,
}: {
  detail: IntegrationDetail;
  query: Params;
  base: string;
  timeZone: string;
}) {
  const { db } = await requireAdmin();
  const where = {
    OR: [
      { integrationId: detail.integration.id },
      ...(detail.integration.gatewayId ? [{ gatewayId: detail.integration.gatewayId, integrationId: null }] : []),
    ],
  };
  const total = await db.integrationEvent.count({ where });
  const paging = listPaging(total, query);
  const events = await db.integrationEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: paging.skip,
    take: paging.take,
  });

  return (
    <Card>
      <CardHeader title="Logg" />
      {events.length === 0 ? (
        <EmptyState title="Ingenting har hänt än" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>När</Th>
                <Th>Händelse</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <Tr key={event.id}>
                  <Td muted>{formatDateTime(event.createdAt, timeZone)}</Td>
                  <Td>
                    {event.level !== "INFO" && (
                      <span className="mr-2">
                        <Badge tone="warning">{event.level === "ERROR" ? "Fel" : "Varning"}</Badge>
                      </span>
                    )}
                    {event.message}
                    <EventErrors details={event.details} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager paging={paging} total={total} unit="händelser" path={base} keep={{ flik: "logg" }} />
        </>
      )}
    </Card>
  );
}

/** Posterna som avvisades i en körning, som de står i händelsens detaljer. */
function EventErrors({ details }: { details: unknown }) {
  const errors = (details as { errors?: { externalId: string; message?: string }[] } | null)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-neutral-500">
      {errors.map((e) => (
        <li key={e.externalId}>
          {e.externalId}: {e.message}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

async function Connection({ detail, timeZone }: { detail: IntegrationDetail; timeZone: string }) {
  const { db } = await requireAdmin();

  if (detail.provider.connectionType === "oauth") {
    return (
      <Card>
        <CardHeader title="Anslutning" />
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <p className="text-[13px] text-neutral-600">Ansluts med inloggning hos {detail.provider.name}.</p>
          <Button type="button" disabled>
            Anslut
          </Button>
        </div>
      </Card>
    );
  }

  const gateways = await gatewayRows(db);
  return (
    <>
      <Card>
        <CardHeader
          title="Tikkr Gateway"
          help="integrationer"
          description={`Installeras på servern där ${detail.provider.name} finns. Ansluter bara utgående, inga portar öppnas.`}
          action={<GatewayTokenDialog action={createGatewayToken} />}
        />
        <div className="border-t border-neutral-200 px-5 py-4 text-[13px] text-neutral-600">
          {GATEWAY_RELEASE ? (
            <a href="/api/admin/gateway/download" className="font-medium text-link hover:underline">
              Ladda ner Tikkr Gateway {GATEWAY_RELEASE.version}
            </a>
          ) : (
            "Installationsfilen publiceras här med den första versionen av Tikkr Gateway."
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Anslutna gatewayer" />
        {gateways.length === 0 ? (
          <EmptyState title="Ingen gateway ansluten" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Dator</Th>
                <Th>Status</Th>
                <Th>Senast hörd</Th>
                <Th>Källor</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <span className="font-medium">{g.machineName ?? "Okänd"}</span>
                    <span className="mt-0.5 block text-xs text-neutral-500">Version {g.version ?? "okänd"}</span>
                  </Td>
                  <Td>
                    <Badge tone={g.state === "connected" ? "active" : "warning"}>{GATEWAY_STATE_LABEL[g.state]}</Badge>
                    {g.lastError && <span className="mt-1 block text-xs text-neutral-500">{g.lastError}</span>}
                  </Td>
                  <Td muted>{g.lastHeartbeatAt ? formatDateTime(g.lastHeartbeatAt, timeZone) : "Aldrig"}</Td>
                  <Td muted>
                    {g.sources.length === 0 ? (
                      "Inga"
                    ) : (
                      <ul className="space-y-0.5">
                        {g.sources.map((s) => (
                          <li key={s.id}>
                            {s.name}: {s.healthy ? `${s.instances?.length ?? 0} företag` : (s.error ?? "fel")}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td>
                    <form action={disconnectGateway} className="flex justify-end">
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="provider" value={detail.provider.id} />
                      <ConfirmButton
                        type="submit"
                        tone="ghost"
                        question={`Koppla från gatewayen på ${g.machineName ?? "datorn"}? Den slutar skicka data direkt och måste registreras igen.`}
                      >
                        Koppla från
                      </ConfirmButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
