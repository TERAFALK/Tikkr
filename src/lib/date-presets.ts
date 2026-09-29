import { addDaysInZone, startOfWeekIn, toDateInput, wallTimeIn } from "./time-zone";

/**
 * SNABBVAL FÖR DATUMINTERVALL.
 *
 * Delad mellan rapportvyn och stämplingsvyn. Låg som en lokal funktion i
 * rapportvyn först; när stämplingsvyn skulle ha samma knappar var alternativet
 * att kopiera kalenderräkningen, och två kopior av "vilken dag börjar veckan"
 * hade glidit isär vid första ändringen.
 *
 * Allt räknas i FÖRETAGETS tidszon. "Idag" måste betyda idag på verkstaden —
 * servern kör UTC, och ett intervall räknat där hoppar fel timmarna runt
 * midnatt.
 */

export interface DateRange {
  from: string;
  to: string;
}

export interface DatePreset extends DateRange {
  label: string;
}

export interface DatePresets {
  presets: DatePreset[];
  /**
   * Förra veckan, måndag till söndag — hela veckan som är klar.
   *
   * Finns BÅDE som snabbval och här för sig. Snabbvalet filtrerar det man ser;
   * det här används av utskriftsknappen "Förra veckan per anställd", som
   * laddar ner en PDF i stället. Samma intervall räknat en gång, så att
   * knappen och filtret aldrig kan mena olika veckor.
   */
  lastWeek: DateRange;
}

export function datePresets(timeZone: string): DatePresets {
  const now = new Date();
  const today = toDateInput(now, timeZone);

  const monday = startOfWeekIn(now, timeZone);
  const lastMonday = addDaysInZone(monday, -7, timeZone);
  const lastSunday = addDaysInZone(lastMonday, 6, timeZone);

  const wall = wallTimeIn(now, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstOfMonth = `${wall.year}-${pad(wall.month)}-01`;

  // Förra månadens första och sista dag. Dag 0 i en månad är sista dagen i
  // den föregående — det slipper en specialregel för februari och för januari,
  // där årtalet också ska backas.
  const lastMonthEnd = new Date(Date.UTC(wall.year, wall.month - 1, 0));
  const iso = (date: Date) =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

  const lastWeek = {
    from: toDateInput(lastMonday, timeZone),
    to: toDateInput(lastSunday, timeZone),
  };

  return {
    presets: [
      { label: "Idag", from: today, to: today },
      { label: "Denna vecka", from: toDateInput(monday, timeZone), to: today },
      // Står näst efter denna vecka, inte sist bland månaderna: det är veckan
      // man stämmer av på måndagen, och därmed det snabbval som används mest.
      { label: "Förra veckan", ...lastWeek },
      { label: "Denna månad", from: firstOfMonth, to: today },
      {
        label: "Förra månaden",
        from: `${lastMonthEnd.getUTCFullYear()}-${pad(lastMonthEnd.getUTCMonth() + 1)}-01`,
        to: iso(lastMonthEnd),
      },
    ],
    lastWeek,
  };
}
