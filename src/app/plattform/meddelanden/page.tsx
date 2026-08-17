import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listNotices, noticeState } from "@/lib/notices";
import { broadcastRecipients } from "@/lib/platform-broadcast";
import { emailIsConfigured } from "@/lib/email";
import PlatformShell from "@/components/platform/PlatformShell";
import NoticeForm from "@/components/platform/NoticeForm";
import BroadcastForm from "@/components/platform/BroadcastForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { removeNotice } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meddelanden — Tikkr Plattform" };

const KIND_LABEL: Record<string, string> = {
  MAINTENANCE: "Underhåll",
  INCIDENT: "Avbrott",
  INFO: "Information",
};

export default async function NoticesPage() {
  const { email } = await requirePlatformAdmin();

  const [notices, all, paying, trialing] = await Promise.all([
    listNotices(),
    broadcastRecipients("all"),
    broadcastRecipients("paying"),
    broadcastRecipients("trialing"),
  ]);

  const mailReady = emailIsConfigured();

  return (
    <PlatformShell email={email} current="/plattform/meddelanden">
      <PageHeader
        title="Driftmeddelanden"
        description="Banner hos kunderna och utskick till administratörer."
      />

      <Card>
        <CardHeader
          title="Nytt meddelande"
          description="Gäller samtliga kunder. Visas från angiven starttid."
        />
        <NoticeForm />
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Inlagda meddelanden"
          description="Arkiverade sparas som underlag."
        />

        {notices.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Inga meddelanden inlagda"
              description="Inlagda meddelanden visas här."
            />
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {notices.map((notice) => {
              const state = noticeState(notice);

              return (
                <div key={notice.id} className="flex gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-neutral-900">
                        {notice.title}
                      </span>
                      <Badge
                        tone={
                          notice.kind === "INCIDENT" ? "warning" : "muted"
                        }
                      >
                        {KIND_LABEL[notice.kind] ?? notice.kind}
                      </Badge>
                      <Badge tone={state === "pågår" ? "active" : "muted"}>
                        {state}
                      </Badge>
                    </div>

                    <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">
                      {notice.body}
                    </p>

                    <p className="mt-1.5 text-xs text-neutral-400">
                      {formatDateTime(notice.startsAt)}
                      {notice.endsAt
                        ? ` – ${formatDateTime(notice.endsAt)}`
                        : " – tills vidare"}
                      {" · "}
                      {[
                        notice.showInAdmin ? "panel" : null,
                        notice.showOnKiosk ? "skärmar" : null,
                        notice.showOnSite ? "säljsida" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      {" · "}
                      {notice.createdByEmail}
                    </p>
                  </div>

                  {!notice.archivedAt && (
                    <form action={removeNotice} className="shrink-0">
                      <input type="hidden" name="id" value={notice.id} />
                      <ConfirmButton
                        type="submit"
                        tone="secondary"
                        question={`Sluta visa "${notice.title}" för kunderna?`}
                      >
                        Arkivera
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Utskick till administratörer"
          description="Går till kundernas administratörer. Avsett för driftinformation."
        />

        {mailReady ? (
          <BroadcastForm
            counts={{
              all: all.length,
              paying: paying.length,
              trialing: trialing.length,
            }}
          />
        ) : (
          <div className="p-5">
            <Alert tone="warning">
              E-post är inte konfigurerad för installationen. Utskick kräver
              MAIL_PROVIDER i .env.
            </Alert>
          </div>
        )}
      </Card>

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        Marknadsföring kräver annan rättslig grund och omfattas inte av
        funktionen.
      </p>
    </PlatformShell>
  );
}
