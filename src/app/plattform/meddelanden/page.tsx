import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { archivedNoticeCount, listNotices, noticeState } from "@/lib/notices";
import PlatformShell from "@/components/platform/PlatformShell";
import NoticeForm from "@/components/platform/NoticeForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { removeNotice } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meddelanden — Tikkr Plattform" };

const KIND_LABEL: Record<string, string> = {
  MAINTENANCE: "Underhåll",
  INCIDENT: "Avbrott",
  INFO: "Information",
};

type Notice = Awaited<ReturnType<typeof listNotices>>[number];

/**
 * DRIFTMEDDELANDEN.
 *
 * Sidan är ordnad efter vad man kommer hit för att göra. Överst det som visas
 * för kunderna just nu, sedan det som är inlagt men inte börjat, och sist det
 * som varit. Formuläret ligger hopfällt: att lägga in ett meddelande är det
 * ovanligare ärendet, och ett halvsidesformulär överst tryckte ned själva
 * listan under skärmkanten.
 *
 * Arkiverade har en egen vy. De är underlag för att kunna visa vad kunderna
 * blev informerade om, inte något man behöver se varje gång.
 */
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ arkiv?: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const showArchive = (await searchParams).arkiv === "1";

  const [notices, archivedCount] = await Promise.all([
    listNotices({ archived: showArchive }),
    archivedNoticeCount(),
  ]);

  if (showArchive) {
    return (
      <PlatformShell email={email} current="/plattform/meddelanden">
        <Link
          href="/plattform/meddelanden"
          className="text-[13px] font-medium text-blue-600 hover:underline"
        >
          ← Driftmeddelanden
        </Link>

        <div className="mt-4">
          <PageHeader
            title="Arkiverade meddelanden"
            description="Sparas som underlag för vad kunderna informerats om. Raderas aldrig."
          />

          {notices.length === 0 ? (
            <EmptyState
              title="Inga arkiverade meddelanden"
              description="Meddelanden du slutar visa hamnar här."
            />
          ) : (
            <Card>
              <div className="divide-y divide-neutral-100">
                {notices.map((notice) => (
                  <NoticeRow key={notice.id} notice={notice} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </PlatformShell>
    );
  }

  const running = notices.filter((n) => noticeState(n) === "pågår");
  const upcoming = notices.filter((n) => noticeState(n) === "kommande");
  const finished = notices.filter((n) => noticeState(n) === "avslutat");

  return (
    <PlatformShell email={email} current="/plattform/meddelanden">
      <PageHeader
        title="Driftmeddelanden"
        description="Banner hos kunderna. Gäller samtliga företag samtidigt."
        action={
          archivedCount > 0 ? (
            <Link
              href="/plattform/meddelanden?arkiv=1"
              className="text-[13px] font-medium text-neutral-500 hover:text-neutral-900"
            >
              Arkiverade ({archivedCount})
            </Link>
          ) : undefined
        }
      />

      {/* Hopfällt formulär, som ett vanligt details-element. Ingen JavaScript
          behövs för att fälla ut det, och det fungerar därmed även om något i
          panelen skulle sluta laddas. */}
      <details className="mt-6 rounded-lg border border-neutral-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-semibold text-neutral-900">
              Nytt meddelande
            </span>
            <span className="mt-0.5 block text-[13px] text-neutral-500">
              Visas från angiven starttid på de ytor du väljer.
            </span>
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white"
          >
            Skriv
          </span>
        </summary>

        <div className="border-t border-neutral-200">
          <NoticeForm />
        </div>
      </details>

      {notices.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Inga meddelanden inlagda"
            description="Underhåll och avbrott som lagts in visas här."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Section
            title="Visas nu"
            description="Syns för kunderna i det här ögonblicket."
            notices={running}
          />
          <Section
            title="Kommande"
            description="Inlagda i förväg. Dyker upp av sig själva."
            notices={upcoming}
          />
          <Section
            title="Avslutade"
            description="Sluttiden har passerat. Arkivera för att städa bort."
            notices={finished}
          />
        </div>
      )}
    </PlatformShell>
  );
}

function Section({
  title,
  description,
  notices,
}: {
  title: string;
  description: string;
  notices: Notice[];
}) {
  // Tomma avsnitt visas inte. En sida full av tomma rutor lär ögat att hoppa
  // över dem, och då syns inte den dagen något faktiskt står där.
  if (notices.length === 0) return null;

  return (
    <Card>
      <CardHeader title={`${title} (${notices.length})`} description={description} />
      <div className="divide-y divide-neutral-100">
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} />
        ))}
      </div>
    </Card>
  );
}

function NoticeRow({ notice }: { notice: Notice }) {
  const surfaces = [
    notice.showInAdmin ? "panel" : null,
    notice.showOnKiosk ? "skärmar" : null,
    notice.showOnSite ? "säljsida" : null,
  ].filter(Boolean);

  return (
    <div className="flex gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-neutral-900">
            {notice.title}
          </span>
          <Badge tone={notice.kind === "INCIDENT" ? "warning" : "muted"}>
            {KIND_LABEL[notice.kind] ?? notice.kind}
          </Badge>
          {surfaces.map((surface) => (
            <Badge key={surface} tone="muted">
              {surface}
            </Badge>
          ))}
        </div>

        <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-neutral-600">
          {notice.body}
        </p>

        <p className="mt-2 text-xs text-neutral-400">
          {formatDateTime(notice.startsAt)}
          {notice.endsAt ? ` – ${formatDateTime(notice.endsAt)}` : " – tills vidare"}
          {" · "}
          {notice.createdByEmail}
          {notice.archivedAt
            ? ` · arkiverat ${formatDateTime(notice.archivedAt)}`
            : ""}
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
}
