"use client";

import { useState } from "react";
import type { TimesheetState } from "@/app/admin/(panel)/tidrapport/actions";
import AbsenceDialog from "./AbsenceDialog";
import CompDialog from "./CompDialog";
import TimesheetTable, { type TimesheetDayRow } from "./TimesheetTable";

/**
 * Binder ihop dagtabellen med frånvaro- och komptidsrutan.
 *
 * Finns bara för att rutorna behöver veta vilken dag man klickade på. Sidan
 * runt omkring är en serverkomponent och ska förbli det — den hämtar en hel
 * tidrapport, och den räkningen hör inte hemma i webbläsaren.
 */
export default function TimesheetView({
  days,
  employeeId,
  employeeName,
  hourly,
  absenceAction,
  compAction,
  deleteAbsenceAction,
  deleteCompAction,
  reasons,
}: {
  days: TimesheetDayRow[];
  employeeId: string;
  employeeName: string;
  /** Timanställd: ingen komptid att registrera. */
  hourly: boolean;
  /** Kundens egna frånvaroorsaker, de aktiva. */
  reasons: { id: string; name: string }[];
  absenceAction: (
    previous: TimesheetState,
    formData: FormData
  ) => Promise<TimesheetState>;
  compAction: (
    previous: TimesheetState,
    formData: FormData
  ) => Promise<TimesheetState>;
  deleteAbsenceAction: (formData: FormData) => Promise<void>;
  deleteCompAction: (formData: FormData) => Promise<void>;
}) {
  const [absenceDate, setAbsenceDate] = useState<string | null>(null);
  const [compDate, setCompDate] = useState<string | null>(null);

  return (
    <>
      <TimesheetTable
        days={days}
        onMarkAbsence={setAbsenceDate}
        onAddComp={hourly ? undefined : setCompDate}
        deleteAbsenceAction={deleteAbsenceAction}
        deleteCompAction={deleteCompAction}
      />

      <AbsenceDialog
        action={absenceAction}
        employeeId={employeeId}
        employeeName={employeeName}
        date={absenceDate}
        reasons={reasons}
        onClose={() => setAbsenceDate(null)}
      />

      {!hourly && (
        <CompDialog
          action={compAction}
          employeeId={employeeId}
          employeeName={employeeName}
          date={compDate}
          onClose={() => setCompDate(null)}
        />
      )}
    </>
  );
}
