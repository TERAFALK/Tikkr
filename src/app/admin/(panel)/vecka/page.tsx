import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { buildWeek, isoWeekNumber } from "@/lib/week";
import WeekStepper from "@/components/admin/WeekStepper";
import { companyTimeZone } from "@/lib/company";
import { hasModule } from "@/lib/company-modules";
import { personHref } from "@/lib/person-link";
import {
  addDaysInZone,
  parseLocalDate,
  startOfWeekIn,
  toDateInput,
  wallTimeIn,
} from "@/lib/time-zone";
import { formatDate, formatDuration } from "@/lib/format";
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

export const metadata = { title: "Veckovy · Tikkr" };

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
  const { db, companyId } = await requireAdmin();
  const params = await searchParams;

  // Veckan räknas i FÖRETAGETS tidszon, inte serverns. Containern kör UTC, och
  // gjorde vyn det också skulle en söndagskväll hamna i veckan efter.
  const timeZone = await companyTimeZone(companyId);
  const payroll = await hasModule(companyId, "PAYROLL");

  // Länkarna bär ett kalenderdatum ("2026-09-22"), som tolkas i samma tidszon
  // som det skrevs i. Ett ogiltigt värde i adressfältet ger denna vecka i
  // stället för ett fel — vyn är till för att titta på, inte att strula med.
  const picked = params.v ? parseLocalDate(params.v, timeZone) : null;
  const week = await buildWeek(db, picked ?? new Date(), timeZone);

  const shift = (days: number) =>
    toDateInput(addDaysInZone(week.from, days, timeZone), timeZone);

  // Veckans sju datum, för kolumnrubrikerna. Räknas fram här och inte ur
  // raderna, eftersom rubriken ska stämma även innan någon anställd finns.
  const dayDates = Array.from({ length: 7 }, (_, index) =>
    addDaysInZone(week.from, index, timeZone)
  );

  const thisWeek =
    startOfWeekIn(new Date(), timeZone).getTime() === week.from.getTime();

  const employeesWithPhoto = await db.employee.findMany({
    where: { photoMimeType: { not: null } },
    select: { id: true },
  });
  const hasPhoto = new Set(employeesWithPhoto.map((employee) => employee.id));

  return (
    <>
      <PageHeader
        title="Veckovy"
        description="Arbetad tid per person och dag."
        action={
          // Samma reglage som på tidrapporten. Se WeekStepper.
          <div className="flex items-center gap-2">
            {!thisWeek && <NavLink href="/admin/vecka" label="Denna vecka" />}
            <WeekStepper
              backHref={`/admin/vecka?v=${shift(-7)}`}
              forwardHref={`/admin/vecka?v=${shift(7)}`}
              label={`Vecka ${isoWeekNumber(week.from, timeZone)}`}
            />
          </div>
        }
      />

      {week.rows.length === 0 ? (
        <EmptyState
          title="Inga anställda upplagda"
        />
      ) : (
        <Card>
          <CardHeader
            title={`${formatDate(week.from, timeZone)} – ${formatDate(week.to, timeZone)}`}
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
                    <span className="block text-[10px] font-normal text-neutral-500">
                      {wallTimeIn(dayDates[index], timeZone).day}
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
                      <span className="min-w-0">
                        <Link
                          href={personHref(row.employeeId, payroll)}
                          className="block font-medium hover:underline"
                        >
                          {row.employeeName}
                        </Link>
                        {row.employeeNumber && (
                          <span className="block text-xs text-neutral-500">
                            {row.employeeNumber}
                          </span>
                        )}
                      </span>
                    </span>
                  </Td>

                  {row.days.map((day) => (
                    <Td key={day.date.toISOString()} numeric>
                      {day.minutes === 0 ? (
                        <span className="text-neutral-300">—</span>
                      ) : (
                        day.needsReview ? (
                          <Link
                            href="/admin/granskning"
                            className="font-medium text-amber-700 underline"
                          >
                            {formatDuration(day.minutes)}
                          </Link>
                        ) : (
                          <span className="tabular-nums">
                            {formatDuration(day.minutes)}
                          </span>
                        )
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

          {/* Färgen ensam säger ingenting, och ett `title` syns inte på en
              pekskärm. */}
          {week.rows.some((row) => row.days.some((day) => day.needsReview)) && (
            <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500">
              Understruken gul tid innehåller en stämpling att granska.
            </p>
          )}
        </Card>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        Tid räknas på den dag posten påbörjades. Gulmarkerad tid innehåller en
        beräknad sluttid.
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
