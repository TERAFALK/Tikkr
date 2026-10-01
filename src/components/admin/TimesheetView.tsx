"use client";

import { useState } from "react";
import type { TimesheetState } from "@/app/admin/(panel)/tidrapport/actions";
import AbsenceDialog from "./AbsenceDialog";
import TimesheetTable, { type TimesheetDayRow } from "./TimesheetTable";

/**
 * Binder ihop dagtabellen med frånvarorutan.
 *
 * Finns bara för att rutan behöver veta vilken dag man klickade på. Sidan
 * runt omkring är en serverkomponent och ska förbli det — den hämtar en hel
 * tidrapport, och den räkningen hör inte hemma i webbläsaren.
 */
export default function TimesheetView({
  days,
  employeeId,
  employeeName,
  absenceAction,
  reasons,
}: {
  days: TimesheetDayRow[];
  employeeId: string;
  employeeName: string;
  /** Kundens egna frånvaroorsaker, de aktiva. */
  reasons: { id: string; name: string }[];
  absenceAction: (
    previous: TimesheetState,
    formData: FormData
  ) => Promise<TimesheetState>;
}) {
  const [absenceDate, setAbsenceDate] = useState<string | null>(null);

  return (
    <>
      <TimesheetTable days={days} onMarkAbsence={setAbsenceDate} />

      <AbsenceDialog
        action={absenceAction}
        employeeId={employeeId}
        employeeName={employeeName}
        date={absenceDate}
        reasons={reasons}
        onClose={() => setAbsenceDate(null)}
      />
    </>
  );
}
