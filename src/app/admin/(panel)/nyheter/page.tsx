import { requireAdmin } from "@/lib/admin-session";
import { enabledModules } from "@/lib/company-modules";
import {
  formatReleaseDate,
  isUnread,
  runningVersion,
  visibleReleases,
} from "@/lib/news";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

/**
 * NYHETERNA: vad som ändrats i varje version, nyast överst (issue #6).
 *
 * Texterna ligger i release-notes.ts och följer med koden, så en version syns
 * här först när den är installerad. Se news.ts.
 *
 * ATT ÖPPNA SIDAN ÄR ATT HA LÄST DEN. Den senaste versionen skrivs på kontot,
 * och pricken i menyn försvinner. Versionerna som var olästa när sidan
 * öppnades märks med Ny, så att den som varit borta ser vad som tillkommit.
 *
 * Inte i supportläget: där är ingen inloggad som kunden, och klienten vägrar
 * dessutom skriva. Se admin-session.ts.
 */

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const session = await requireAdmin();
  const version = runningVersion();
  const releases = visibleReleases(
    version,
    await enabledModules(session.companyId)
  );

  const me = session.support
    ? null
    : await session.db.adminUser.findFirst({
        where: { id: session.userId },
        select: { newsSeenVersion: true },
      });

  // Läst FÖRE skrivningen nedan, annars märks ingenting som nytt.
  const seen = me?.newsSeenVersion ?? null;
  const latest = releases[0]?.version;

  // Skrivs bara framåt. Har produktionen backats till en äldre version ska
  // kontot inte glömma att den nyare redan lästs.
  if (me && latest && isUnread(latest, seen)) {
    await session.db.adminUser.updateMany({
      where: { id: session.userId },
      data: { newsSeenVersion: latest },
    });
  }

  return (
    <div>
      <PageHeader
        title="Nyheter"
        action={
          <p className="text-[13px] text-neutral-500">
            Version{" "}
            <span className="font-medium tabular-nums text-neutral-900">
              {version}
            </span>
          </p>
        }
      />

      {releases.length === 0 ? (
        <EmptyState title="Inga nyheter" />
      ) : (
        <ol className="max-w-3xl">
          {releases.map((release, index) => {
            const last = index === releases.length - 1;
            const unread = me !== null && isUnread(release.version, seen);

            return (
              <li
                key={release.version}
                className="grid sm:grid-cols-[9rem_1fr] sm:gap-x-8"
              >
                <div className="mb-2 flex items-center gap-2 sm:mb-0 sm:block sm:pt-0.5 sm:text-right">
                  <p className="text-[13px] font-medium text-neutral-900">
                    {formatReleaseDate(release.date)}
                  </p>
                  <p className="sm:mt-1.5">
                    <Badge>{release.version}</Badge>
                  </p>
                </div>

                {/* Linjen är kolumnens vänsterkant. Den sista posten har ingen
                    luft under sig, så att linjen slutar vid den. */}
                <div
                  className={`relative border-l border-neutral-200 pl-6 sm:pl-8 ${
                    last ? "" : "pb-10"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute -left-[6px] top-1.5 size-[11px] rounded-full border-2 border-fjord bg-white"
                  />

                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-neutral-900">
                    {release.title}
                    {unread && <Badge tone="active">Ny</Badge>}
                  </h2>

                  {release.summary && (
                    <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">
                      {release.summary}
                    </p>
                  )}

                  <div className="mt-3 space-y-4">
                    <Group label="Nytt" items={release.added} />
                    <Group label="Förbättringar" items={release.improved} />
                    <Group label="Rättade fel" items={release.fixed} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Group({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-neutral-700 marker:text-neutral-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
