import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCompanyDetail,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Stat,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { changeSubscription, updateNote } from "./actions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const { companyId } = await params;

  const detail = await getCompanyDetail(companyId);
  if (!detail) notFound();

  const { company, admins, devices, note, history, stats } = detail;

  const inactiveDays = stats.lastActivityAt
    ? Math.floor(
        (Date.now() - stats.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
      )
    : null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link href="/plattform" className="text-[13px] font-medium text-blue-600">
            ← Kundöversikt
          </Link>
          <span className="ml-auto text-[13px] text-neutral-400">{email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title={company.name}
          description={`Upplagt ${formatDate(company.createdAt)} · tidszon ${company.timezone} · stänger glömda stämplingar ${company.autoCloseAt}`}
        />

        {inactiveDays !== null && inactiveDays >= 14 && (
          <Alert tone="warning">
            Ingen stämpling på {inactiveDays} dagar. En kund som slutat använda
            systemet säger oftast upp sig långt efter att de slutat — det här är
            tidpunkten att höra av sig, inte när uppsägningen kommer.
          </Alert>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Stämplingar 30 d"
            value={stats.entriesLast30Days}
            tone={stats.entriesLast30Days > 0 ? "active" : "warning"}
            hint={`${stats.totalEntries} totalt`}
          />
          <Stat label="Anställda" value={stats.employees} />
          <Stat label="Öppna ordrar" value={stats.openOrders} />
          <Stat
            label="Ogranskade poster"
            value={stats.needsReview}
            tone={stats.needsReview > 0 ? "warning" : "neutral"}
            hint={`${stats.openNow} pågår just nu`}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Prenumeration */}
          <Card>
            <CardHeader
              title="Prenumeration"
              description="Sätts för hand tills Stripe är kopplat. Även därefter behövs den för fakturakunder och förlängda provperioder."
            />
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-neutral-500">Nu:</span>
                <SubscriptionBadge status={company.subscriptionStatus} />
              </div>

              <form action={changeSubscription} className="space-y-3">
                <input type="hidden" name="companyId" value={company.id} />

                <Field label="Ny status">
                  <Select name="status" defaultValue={company.subscriptionStatus}>
                    <option value="TRIALING">Provperiod</option>
                    <option value="ACTIVE">Aktiv</option>
                    <option value="PAST_DUE">Obetald</option>
                    <option value="CANCELED">Avslutad</option>
                  </Select>
                </Field>

                <Field
                  label="Anledning"
                  hint="Obligatorisk. En statusändring utan förklaring är värdelös den dag någon undrar varför en kund spärrades."
                >
                  <Input
                    name="reason"
                    placeholder="Betalt mot faktura, förfaller 2026-12-31"
                    required
                  />
                </Field>

                <Button type="submit">Spara</Button>
              </form>
            </div>
          </Card>

          {/* Anteckning */}
          <Card>
            <CardHeader
              title="Intern anteckning"
              description="Syns bara här. Kunden ser den aldrig."
            />
            <form action={updateNote} className="space-y-3 p-5">
              <input type="hidden" name="companyId" value={company.id} />
              <textarea
                name="body"
                rows={6}
                defaultValue={note?.body ?? ""}
                placeholder="Kontaktperson, avtalsdetaljer, vad supportärendet handlade om…"
                className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
              {note && (
                <p className="text-xs text-neutral-400">
                  Senast ändrad {formatDateTime(note.updatedAt)} av{" "}
                  {note.updatedByEmail}
                </p>
              )}
              <Button type="submit" tone="secondary">
                Spara anteckning
              </Button>
            </form>
          </Card>
        </div>

        {/* Kontakter */}
        <Card className="mt-6">
          <CardHeader
            title="Vilka som kan logga in"
            description="Adresserna du kontaktar vid supportärenden och fakturering."
          />
          <Table>
            <thead>
              <tr>
                <Th>E-postadress</Th>
                <Th>Behörighet</Th>
                <Th>Upplagd</Th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <Tr key={admin.id}>
                  <Td>
                    <a
                      href={`mailto:${admin.email}`}
                      className="font-medium text-blue-600"
                    >
                      {admin.email}
                    </a>
                  </Td>
                  <Td muted>
                    {admin.role === "OWNER" ? "Ägare" : "Administratör"}
                  </Td>
                  <Td muted>{formatDate(admin.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Skärmar */}
        <Card className="mt-6">
          <CardHeader
            title="Stämplingsskärmar"
            description="Vanligaste supportärendet: en skärm som slutat höra av sig."
          />
          {devices.length === 0 ? (
            <p className="p-5 text-[13px] text-neutral-500">
              Ingen skärm upplagd. Kunden kan alltså inte stämpla än.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Namn</Th>
                  <Th>Status</Th>
                  <Th>Senast aktiv</Th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <Tr key={device.id} dimmed={!device.active}>
                    <Td>{device.name}</Td>
                    <Td>
                      {device.active ? (
                        <Badge tone="active">Aktiv</Badge>
                      ) : (
                        <Badge tone="muted">Återkallad</Badge>
                      )}
                    </Td>
                    <Td muted>
                      {device.lastSeenAt
                        ? formatDateTime(device.lastSeenAt)
                        : "Aldrig kopplad"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Logg */}
        <Card className="mt-6">
          <CardHeader
            title="Vad som gjorts härifrån"
            description="Allt som ändrar något i den här panelen loggas. Utan det är det din utsaga mot kundens den dag något ifrågasätts."
          />
          {history.length === 0 ? (
            <p className="p-5 text-[13px] text-neutral-500">
              Ingenting har ändrats för det här företaget.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>När</Th>
                  <Th>Vem</Th>
                  <Th>Vad</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <Tr key={row.id}>
                    <Td muted>{formatDateTime(row.createdAt)}</Td>
                    <Td muted>{row.actorEmail}</Td>
                    <Td>
                      {row.action}
                      {row.detail && (
                        <span className="mt-0.5 block text-neutral-500">
                          {row.detail}
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Alert tone="info">
          Innehållet i kundens data — namn på anställda, ordernummer och
          registrerade tider — går inte att nå härifrån, med flit. Behöver du
          hjälpa till med något konkret får kunden bjuda in dig som
          administratör hos sig, med en länk de kan återkalla efteråt.
        </Alert>
      </main>
    </div>
  );
}

function SubscriptionBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge tone="active">Aktiv</Badge>;
  if (status === "TRIALING") return <Badge>Provperiod</Badge>;
  if (status === "PAST_DUE") return <Badge tone="warning">Obetald</Badge>;
  return <Badge tone="muted">Avslutad</Badge>;
}
