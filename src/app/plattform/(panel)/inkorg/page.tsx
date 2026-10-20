import Link from "next/link";
import type { FeedbackKind } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  FEEDBACK_KIND_LABEL,
  INBOX_PAGE_SIZE,
  MAX_BODY_LENGTH,
  areaLabel,
  listInbox,
} from "@/lib/feedback";
import Pager from "@/components/platform/Pager";
import ActionDialog from "@/components/ui/ActionDialog";
import { Card, EmptyState, Field, PageHeader, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { markDoneAction, type DoneFormState } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inkorg · Tikkr" };

/** Vyn i adressen. Utan värde: det som inte är klarmarkerat. */
const VIEWS = { inkorg: "Inkorg", arkiv: "Arkiv" } as const;
type View = keyof typeof VIEWS;

/** Typfiltret i adressen, med gemener. */
const KIND_FILTERS: Record<string, FeedbackKind> = {
  fel: "BUG",
  forslag: "SUGGESTION",
  synpunkt: "FEEDBACK",
};

/**
 * INKORGEN: FEL OCH FÖRSLAG FRÅN KUNDERNA (issue #8, steg 2).
 *
 * Skickade från rutan i kundernas meny. Ett meddelande klarmarkeras med en
 * anteckning om vad som gjordes och ligger sedan i arkivet. Kunden ser inget
 * av det, se feedback.ts.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ vy?: string; typ?: string; kund?: string; sida?: string }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;

  const view: View = params.vy === "arkiv" ? "arkiv" : "inkorg";
  const kindKey = params.typ && KIND_FILTERS[params.typ] ? params.typ : undefined;
  const page = Math.max(1, Number(params.sida) || 1);

  const company = params.kund
    ? await unsafeGlobalPrisma.company.findUnique({
        where: { id: params.kund },
        select: { id: true, name: true },
      })
    : null;

  const { rows, total } = await listInbox({
    archived: view === "arkiv",
    kind: kindKey ? KIND_FILTERS[kindKey] : undefined,
    companyId: company?.id,
    page,
  });

  // Filtren bygger på varandra: ett byte av vy behåller typ och kund.
  const hrefWith = (change: {
    vy?: View;
    typ?: string | null;
    kund?: null;
    sida?: number;
  }) => {
    const query = new URLSearchParams();
    const vy = change.vy ?? view;
    if (vy !== "inkorg") query.set("vy", vy);
    const typ = change.typ === null ? undefined : (change.typ ?? kindKey);
    if (typ) query.set("typ", typ);
    if (company && change.kund !== null) query.set("kund", company.id);
    if (change.sida && change.sida > 1) query.set("sida", String(change.sida));
    const text = query.toString();
    return `/plattform/inkorg${text ? `?${text}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Inkorg" />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterLinks
          items={(Object.keys(VIEWS) as View[]).map((key) => ({
            href: hrefWith({ vy: key }),
            label: VIEWS[key],
            active: key === view,
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
          <Link
            href={hrefWith({ kund: null })}
            className="font-medium text-tick-deep hover:underline"
          >
            Visa alla kunder
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState title={view === "arkiv" ? "Arkivet är tomt" : "Inga nya meddelanden"} />
      ) : (
        <div className="max-w-3xl space-y-4">
          {rows.map((message) => (
            <Card key={message.id}>
              <div className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <span className="font-semibold text-neutral-900">
                    {FEEDBACK_KIND_LABEL[message.kind]} · {areaLabel(message.area)}
                  </span>
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

                {message.doneAt && (
                  <div className="mt-3 rounded-md border-l-2 border-neutral-300 bg-neutral-50 px-3 py-2">
                    <p className="text-xs font-medium text-neutral-500">
                      Klar · {message.doneByEmail ?? "okänd"} ·{" "}
                      {formatDateTime(message.doneAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-800">
                      {message.doneNote}
                    </p>
                  </div>
                )}
              </div>

              {!message.doneAt && (
                <div className="flex justify-end border-t border-neutral-100 px-5 py-3">
                  <ActionDialog<DoneFormState>
                    trigger="Klarmarkera"
                    title="Klarmarkera"
                    action={markDoneAction}
                    initial={{}}
                    submitLabel="Klarmarkera"
                  >
                    <input type="hidden" name="id" value={message.id} />
                    <Field label="Vad gjordes" hint="Syns bara i arkivet">
                      <Textarea
                        name="note"
                        rows={4}
                        maxLength={MAX_BODY_LENGTH}
                        required
                      />
                    </Field>
                  </ActionDialog>
                </div>
              )}
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
    </>
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
