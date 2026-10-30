import { requireAdmin } from "@/lib/admin-session";
import { requireWorkHours } from "@/lib/company-modules";
import { loadWorkSchedules } from "@/lib/work-hours";
import { formatMinuteOfDay } from "@/lib/weekly-hours";
import ScheduleForm, {
  type ScheduleDayValue,
} from "@/components/admin/ScheduleForm";
import { saveSchedule } from "./actions";

export const metadata = { title: "Arbetstider · Tikkr" };

/**
 * FÖRETAGETS ARBETSTIDER (beslutat 2026-10-17).
 *
 * Arbetsytans och inte ett tillvals. Löneunderlaget mäter flexen mot dem och
 * planeringen gråmarkerar och varnar efter dem, och sidan finns med vilket av
 * dem som helst. Den som inte går på företagets tider får egna under
 * Anställda. Se lib/work-hours.ts.
 *
 * Sidan låg under Löneunderlag, och planeringen fick under en kort tid en egen
 * uppsättning tider bredvid. Samma människors tider på två ställen blev
 * rörigt, och de hann sluta säga samma sak.
 */

export const dynamic = "force-dynamic";

export default async function WorkHoursPage() {
  const session = await requireAdmin();
  await requireWorkHours(session);

  const { schedules, defaultId } = await loadWorkSchedules(session.db, []);
  const schedule = defaultId ? schedules.get(defaultId) : undefined;

  const initial: ScheduleDayValue[] = (schedule?.days ?? []).map((day) => ({
    weekday: day.weekday,
    start: formatMinuteOfDay(day.startMinute),
    end: formatMinuteOfDay(day.endMinute),
    breaks: day.breaks.map((rest) => ({
      start: formatMinuteOfDay(rest.startMinute),
      end: formatMinuteOfDay(rest.endMinute),
    })),
  }));

  return (
    <div className="space-y-6">
      <ScheduleForm action={saveSchedule} initial={initial} />
    </div>
  );
}
