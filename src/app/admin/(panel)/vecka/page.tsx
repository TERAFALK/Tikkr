import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { buildWeek, isoWeekNumber, startOfWeek } from "@/lib/week";
import { formatDuration } from "@/lib/format";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const DAYS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

/**
 * VECKOVYN.
 *
 * Rapporterna svarar på vad en order kostat. Den här vyn svarar på om veckan
 * ser rimlig ut, och en orimlighet syns som ett mönster långt innan den syns
 * som en siffra: en tom dag mitt i veckan, en dag med fjorton timmar, en
 * person vars hela vecka ligger på samma order.
 *
 * Tomma dagar visas som ett streck och inte som "0 min". Nollor i varje ruta
 * gör rutnätet till en vägg av siffror där mönstret försvinner.
 */
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { db } = await requireAdmin();
  const params = await searchParams;

  const monday = params.v ? startOfWeek(new Date(params.v)) : startOfWeek(new Date());
  const week = await buildWeek(db, monday);

  const shift = (days: number) => {
    const date = new Date(week.from);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const thisWeek = startOfWeek(new Date()).getTime() === week.from.getTime();

  const employeesWithPhoto = await db.employee.findMany({
    where: { photoMimeType: { not: null } },
    select: { id: true },
  });
  const hasPhoto = new Set(employeesWithPhoto.map((employee) => employee.id));

  return (
    <>
      <PageHeader
        title="Veckovy"
        description="Registrerad tid per person och dag. Avvikelser syns som mönster."
        action={
          <div className="flex items-center gap-1">
            <NavLink href={`/admin/vecka?v=${shift(-7)}`} label="Föregående" />
            {!thisWeek && <NavLink href="/admin/vecka" label="Denna vecka" />}
            <NavLink href={`/admin/vecka?v=${shift(7)}`} label="Nästa" />
          </div>
        }
      />

      {week.rows.length === 0 ? (
        <EmptyState
          title="Inga anställda upplagda"
          description="Veckovyn visar registrerad tid per person."
        />
      ) : (
        <Card>
          <CardHeader
            title={`Vecka ${isoWeekNumber(week.from)}`}
            description={`${week.from.toLocaleDateString("sv-SE")} – ${week.to.toLocaleDateString("sv-SE")}`}
            action={
              <span className="text-[13px] font-medium tabular-nums text-neutral-900">
                {formatDuration(week.totalMinutes)} totalt
              </span>
            }
          />

          <Table>
            <thead>
              <tr>
                <Th>Anställd</Th>
                {DAYS.map((day, index) => (
                  <Th key={day} numeric>
                    <span className="block">{day}</span>
                    <span className="block text-[10px] font-normal text-neutral-400">
                      {new Date(
                        week.from.getTime() + index * 86_400_000
                      ).getDate()}
                    </span>
                  </Th>
                ))}
                <Th numeric>Summa</Th>
              </tr>
            </thead>

            <tbody>
              {week.rows.map((row) => (
                <Tr key={row.employeeId} dimmed={row.totalMinutes === 0}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <EmployeeAvatar
                        employeeId={row.employeeId}
                        name={row.employeeName}
                        hasPhoto={hasPhoto.has(row.employeeId)}
                        size={28}
                      />
                      <span className="font-medium">{row.employeeName}</span>
                    </span>
                  </Td>

                  {row.days.map((day) => (
                    <Td key={day.date.toISOString()} numeric>
                      {day.minutes === 0 ? (
                        <span className="text-neutral-300">—</span>
                      ) : (
                        <span
                          className={
                            day.needsReview
                              ? "font-medium text-amber-700"
                              : "tabular-nums"
                          }
                          title={
                            day.needsReview
                              ? "Innehåller en post med beräknad sluttid"
                              : undefined
                          }
                        >
                          {formatDuration(day.minutes)}
                        </span>
                      )}
                    </Td>
                  ))}

                  <Td numeric>
                    <span className="font-medium tabular-nums">
                      {formatDuration(row.totalMinutes)}
                    </span>
                  </Td>
                </Tr>
              ))}

              <Tr>
                <Td>
                  <span className="text-[13px] font-medium text-neutral-500">
                    Summa
                  </span>
                </Td>
                {week.dayTotals.map((minutes, index) => (
                  <Td key={index} numeric muted>
                    {minutes === 0 ? "—" : formatDuration(minutes)}
                  </Td>
                ))}
                <Td numeric>
                  <span className="font-semibold tabular-nums">
                    {formatDuration(week.totalMinutes)}
                  </span>
                </Td>
              </Tr>
            </tbody>
          </Table>
        </Card>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        Tid räknas på den dag posten påbörjades. Ett skift som passerar midnatt
        hamnar därför på kvällen det började. Gulmarkerad tid innehåller en post
        vars sluttid beräknats av systemet.
      </p>
    </>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
    >
      {label}
    </Link>
  );
}
