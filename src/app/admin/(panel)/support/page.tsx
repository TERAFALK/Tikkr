import type { FeedbackStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-session";
import SaveForm from "@/components/admin/SaveForm";
import {
  Badge,
  Card,
  CardHeader,
  Field,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { HELP_AREAS, HELP_AREA_KEYS, areaForPath } from "@/lib/help/areas";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_LABEL,
  MAX_BODY_LENGTH,
  areaLabel,
  cleanPage,
  listCompanyFeedback,
  markSupportSeen,
} from "@/lib/feedback";
import { formatDateTime } from "@/lib/format";
import { sendFeedbackAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * SUPPORT: FEL, FÖRSLAG OCH SYNPUNKTER (issue #8, steg 2).
 *
 * Formuläret överst och arbetsytans skickade meddelanden under, med status
 * och våra svar. Hela arbetsytans och inte bara de egna: två administratörer
 * som hittar samma fel ska kunna se att det redan är anmält.
 *
 * Menyn skickar med sidan man kom ifrån (?sida=/admin/planering). Den förväljer
 * området och sparas med meddelandet, så att vi ser var felet uppstod utan att
 * behöva fråga.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ sida?: string }>;
}) {
  const session = await requireAdmin();
  const page = cleanPage((await searchParams).sida);

  // Läst FÖRE skrivningen nedan, annars märks inget svar som nytt. Inte i
  // supportläget: där är ingen inloggad som kunden, och klienten skriver inte.
  const me = session.support
    ? null
    : await session.db.adminUser.findFirst({
        where: { id: session.userId },
        select: { supportSeenAt: true },
      });
  const seenAt = me?.supportSeenAt ?? null;
  if (me) await markSupportSeen(session.db, session.userId);

  const messages = await listCompanyFeedback(session.db);

  return (
    <>
      <PageHeader title="Support" />

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="Nytt meddelande" />
          <SaveForm
            action={sendFeedbackAction}
            submitLabel="Skicka"
            pendingLabel="Skickar…"
            className="space-y-4 p-5"
          >
            <input type="hidden" name="page" value={page ?? ""} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Typ">
                <Select name="kind" defaultValue="BUG">
                  {FEEDBACK_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {FEEDBACK_KIND_LABEL[kind]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Område">
                <Select name="area" defaultValue={areaForPath(page) ?? ""}>
                  {HELP_AREA_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {HELP_AREAS[key].label}
                    </option>
                  ))}
                  <option value="">Annat</option>
                </Select>
              </Field>
            </div>

            <Field label="Meddelande">
              <Textarea name="body" rows={6} maxLength={MAX_BODY_LENGTH} required />
            </Field>
          </SaveForm>
        </Card>

        {messages.length > 0 && (
          <Card>
            <CardHeader title="Skickade" />
            <ul className="divide-y divide-neutral-100">
              {messages.map((message) => {
                // Svar eller ny status på ett av de egna meddelandena sedan
                // sidan senast öppnades. Samma villkor som pricken i menyn.
                const unseen =
                  me !== null &&
                  message.authorUserId === session.userId &&
                  message.customerUpdatedAt !== null &&
                  (seenAt === null || message.customerUpdatedAt > seenAt);

                return (
                  <li key={message.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span className="font-medium text-neutral-900">
                        {FEEDBACK_KIND_LABEL[message.kind]} · {areaLabel(message.area)}
                      </span>
                      <StatusBadge status={message.status} />
                      {unseen && (
                        <span className="size-2 rounded-full bg-tick-deep">
                          <span className="sr-only">Uppdaterat</span>
                        </span>
                      )}
                      <span className="ml-auto text-neutral-500">
                        {message.authorName ?? message.authorEmail} ·{" "}
                        {formatDateTime(message.createdAt)}
                      </span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-700">
                      {message.body}
                    </p>

                    {message.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="mt-3 rounded-md border-l-2 border-tick-deep bg-neutral-50 px-3 py-2"
                      >
                        <p className="text-xs font-medium text-neutral-500">
                          Tikkr · {formatDateTime(reply.createdAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-800">
                          {reply.body}
                        </p>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

/** Grönt är pågår, som överallt i panelen. Klar tonas ned. */
function StatusBadge({ status }: { status: FeedbackStatus }) {
  const tone =
    status === "IN_PROGRESS" ? "active" : status === "DONE" ? "muted" : "neutral";
  return <Badge tone={tone}>{FEEDBACK_STATUS_LABEL[status]}</Badge>;
}
