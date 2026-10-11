import Link from "next/link";
import type { FeedbackKind, FeedbackStatus } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  FEEDBACK_KIND_LABEL,
  INBOX_PAGE_SIZE,
  MAX_BODY_LENGTH,
  OPEN_STATUSES,
  areaLabel,
  listInbox,
} from "@/lib/feedback";
import PlatformShell from "@/components/platform/PlatformShell";
import Pager from "@/components/platform/Pager";
import { FeedbackStatusBadge } from "@/components/platform/Pieces";
import SaveForm from "@/components/admin/SaveForm";
import { Button, Card, EmptyState, PageHeader, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { replyAction, setStatusAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inkorg · Tikkr" };

/** Statusfiltret i adressen. Utan värde: det som inte är klart. */
const STATUS_FILTERS: Record<string, { label: string; statuses: FeedbackStatus[] }> = {
  oppna: { label: "Öppna", statuses: OPEN_STATUSES },
  ny: { label: "Ny", statuses: ["NEW"] },
  pagar: { label: "Pågår", statuses: ["IN_PROGRESS"] },
  klar: { label: "Klar", statuses: ["DONE"] },
  alla: { label: "Alla", statuses: ["NEW", "IN_PROGRESS", "DONE"] },
};

/** Typfiltret i adressen, med gemener. */
const KIND_FILTERS: Record<string, FeedbackKind> = {
  fel: "BUG",
  forslag: "SUGGESTION",
  synpunkt: "FEEDBACK",
};

/**
 * INKORGEN: VAD KUNDERNA SKRIVIT TILL OSS (issue #8, steg 2).
 *
 * Fel, förslag och synpunkter från sidan Support i kundernas panel. Nyast
 * först, och bara det som inte är klart om inget annat väljs: Klar är arkivet.
 *
 * Varje meddelande går att besvara och flytta mellan Ny, Pågår och Klar.
 * Kunden ser både svaret och statusen, och får en prick i menyn. Ett svar på
 * ett nytt meddelande gör det till Pågår, se replyToFeedback.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; typ?: string; kund?: string; sida?: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const params = await searchParams;

  const statusKey = params.status && STATUS_FILTERS[params.status] ? params.status : "oppna";
  const kindKey = params.typ && KIND_FILTERS[params.typ] ? params.typ : undefined;
  const page = Math.max(1, Number(params.sida) || 1);

  const company = params.kund
    ? await unsafeGlobalPrisma.company.findUnique({
        where: { id: params.kund },
        select: { id: true, name: true },
      })
    : null;

  const { rows, total } = await listInbox({
    statuses: STATUS_FILTERS[statusKey].statuses,
    kind: kindKey ? KIND_FILTERS[kindKey] : undefined,
    companyId: company?.id,
    page,
  });

  // Filtren bygger på varandra: ett byte av status behåller typ och kund.
  const hrefWith = (change: { status?: string; typ?: string | null; sida?: number }) => {
    const query = new URLSearchParams();
    const status = change.status ?? statusKey;
    if (status !== "oppna") query.set("status", status);
    const typ = change.typ === null ? undefined : (change.typ ?? kindKey);
    if (typ) query.set("typ", typ);
    if (company) query.set("kund", company.id);
    if (change.sida && change.sida > 1) query.set("sida", String(change.sida));
    const text = query.toString();
    return `/plattform/inkorg${text ? `?${text}` : ""}`;
  };

  return (
    <PlatformShell email={email}>
      <PageHeader title="Inkorg" />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterLinks
          items={Object.entries(STATUS_FILTERS).map(([key, filter]) => ({
            href: hrefWith({ status: key }),
            label: filter.label,
            active: key === statusKey,
          }))}
        />
        <FilterLinks
          items={[
            { href: hrefWith({ typ: null }), label: "Alla typer", active: !kindKey },
            ...Object.entries(KIND_FILTERS).map(([key, kind]) => ({
              href: hrefWith({ typ: key }),
              label: FEEDBACK_KIND_LABEL[kind],
              active: key === kindKey,
            })),
          ]}
        />
      </div>

      {company && (
        <p className="mb-4 text-[13px] text-neutral-600">
          Bara {company.name} ·{" "}
          <Link href="/plattform/inkorg" className="font-medium text-tick-deep hover:underline">
            Visa alla kunder
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Inga meddelanden" />
      ) : (
        <div className="max-w-3xl space-y-4">
          {rows.map((message) => (
            <Card key={message.id}>
              <div className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <span className="font-semibold text-neutral-900">
                    {FEEDBACK_KIND_LABEL[message.kind]} · {areaLabel(message.area)}
                  </span>
                  <FeedbackStatusBadge status={message.status} />
                  <span className="ml-auto text-neutral-500">
                    {formatDateTime(message.createdAt)}
                  </span>
                </div>

                <p className="mt-1 text-[13px] text-neutral-500">
                  <Link
                    href={`/plattform/kunder/${message.company.id}`}
                    className="font-medium text-tick-deep hover:underline"
                  >
                    {message.company.name}
                  </Link>{" "}
                  · {message.authorName ? `${message.authorName}, ` : ""}
                  {message.authorEmail}
                  {message.page && (
                    <>
                      {" "}
                      · <span className="font-mono text-xs">{message.page}</span>
                    </>
                  )}
                </p>

                <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-800">
                  {message.body}
                </p>

                {message.replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="mt-3 rounded-md border-l-2 border-tick-deep bg-neutral-50 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-neutral-500">
                      {reply.authorEmail} · {formatDateTime(reply.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-800">
                      {reply.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-neutral-100">
                <SaveForm
                  action={replyAction}
                  submitLabel="Svara"
                  pendingLabel="Skickar…"
                  tone="secondary"
                  className="space-y-3 px-5 py-4"
                >
                  <input type="hidden" name="id" value={message.id} />
                  <Textarea
                    name="body"
                    rows={3}
                    maxLength={MAX_BODY_LENGTH}
                    required
                    aria-label="Svar till kunden"
                    placeholder="Svar till kunden"
                  />
                </SaveForm>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-neutral-100 px-5 py-3">
                {message.status !== "IN_PROGRESS" && (
                  <StatusButton id={message.id} status="IN_PROGRESS">
                    {message.status === "DONE" ? "Öppna igen" : "Markera pågår"}
                  </StatusButton>
                )}
                {message.status !== "DONE" && (
                  <StatusButton id={message.id} status="DONE">
                    Markera klar
                  </StatusButton>
                )}
              </div>
            </Card>
          ))}

          {total > INBOX_PAGE_SIZE && (
            <Card>
              <Pager
                page={page}
                pageCount={Math.ceil(total / INBOX_PAGE_SIZE)}
                total={total}
                unit="meddelanden"
                hrefFor={(next) => hrefWith({ sida: next })}
              />
            </Card>
          )}
        </div>
      )}
    </PlatformShell>
  );
}

function StatusButton({
  id,
  status,
  children,
}: {
  id: string;
  status: FeedbackStatus;
  children: React.ReactNode;
}) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" tone="ghost">
        {children}
      </Button>
    </form>
  );
}

function FilterLinks({
  items,
}: {
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
            item.active
              ? "bg-fjord text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
