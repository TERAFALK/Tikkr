import { describe, it, expect } from "vitest";
import {
  SNAP_MINUTES,
  blockEnd,
  breakSpans,
  capacityOf,
  dayWindow,
  fitsFrom,
  snap,
  snapInstant,
  stationDayLoad,
  workingMinutesBetween,
  workingWindows,
  type StationHours,
} from "@/lib/plan-calendar";
import { instantFromWallTime, wallTimeIn } from "@/lib/time-zone";

/**
 * ARBETSMINUTER MOT VÄGGKLOCKA. Behöver ingen databas.
 *
 * Det här är planeringens enda verkligt kniviga räkning, och den sortens fel
 * syns inte i en bild: en ruta som ligger fyrtio minuter fel ser ut som en
 * ruta. Därför ligger räkningen i en ren fil och testas för sig, innan något
 * ritas.
 *
 * Regeln som prövas: BARA STATIONENS EGNA RASTER HOPPAS ÖVER. Tid utanför
 * öppettiderna är arbete, eftersom en ruta som lagts dit är överbokning och
 * överbokning betyder att maskinen ska gå.
 */

const SE = "Europe/Stockholm";

/** Fräsen: öppen 07:00–16:00 med fyrtio minuters lunch. */
const FRAS: StationHours = {
  weekday: 2,
  startMinute: 7 * 60,
  endMinute: 16 * 60,
  breaks: [{ startMinute: 12 * 60, endMinute: 12 * 60 + 40 }],
};

/** En tidpunkt på väggen i Stockholm. Tisdag 2026-10-06 om inget annat sägs. */
function at(hour: number, minute = 0, day = 6, month = 10, year = 2026): Date {
  return instantFromWallTime({ year, month, day, hour, minute }, SE);
}

/** "14:40" för en tidpunkt, läst på väggen. Lättare att se fel i än ett tal. */
function clock(instant: Date): string {
  const wall = wallTimeIn(instant, SE);
  return `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`;
}

describe("kapaciteten en dag", () => {
  it("är spannet minus rasterna", () => {
    // 09:00 minus 00:40 = 08:20, alltså 500 minuter.
    expect(capacityOf(FRAS)).toBe(500);
  });

  it("är noll för en stängd dag", () => {
    // Rätt svar för en lördag, och skälet att en saknad veckodag inte är ett
    // fel utan ett svar.
    expect(capacityOf(null)).toBe(0);
    expect(capacityOf(undefined)).toBe(0);
  });

  it("räknar inte en rast som ligger utanför passet", () => {
    const hours: StationHours = {
      ...FRAS,
      breaks: [{ startMinute: 18 * 60, endMinute: 19 * 60 }],
    };

    expect(capacityOf(hours)).toBe(9 * 60);
  });

  it("klipper en rast som sticker ut ur passet", () => {
    // Lunch 15:30–16:30 på en station som stänger 16:00 drar av trettio
    // minuter, inte sextio.
    const hours: StationHours = {
      ...FRAS,
      breaks: [{ startMinute: 15 * 60 + 30, endMinute: 16 * 60 + 30 }],
    };

    expect(capacityOf(hours)).toBe(9 * 60 - 30);
  });
});

describe("rasterna på väggen", () => {
  it("ger ett spann per rast", () => {
    const spans = breakSpans(FRAS, at(0), SE);

    expect(spans).toHaveLength(1);
    expect(clock(new Date(spans[0].from))).toBe("12:00");
    expect(clock(new Date(spans[0].to))).toBe("12:40");
  });

  it("slår ihop raster som ligger i varandra", () => {
    // Ett formulär kan skickas med överlappande rader, och då får samma kvart
    // inte dras av två gånger.
    const hours: StationHours = {
      ...FRAS,
      breaks: [
        { startMinute: 12 * 60, endMinute: 12 * 60 + 40 },
        { startMinute: 12 * 60 + 20, endMinute: 13 * 60 },
      ],
    };

    const spans = breakSpans(hours, at(0), SE);

    expect(spans).toHaveLength(1);
    expect(clock(new Date(spans[0].from))).toBe("12:00");
    expect(clock(new Date(spans[0].to))).toBe("13:00");
    expect(capacityOf(hours)).toBe(9 * 60 - 60);
  });

  it("är tom för en stängd dag", () => {
    expect(breakSpans(null, at(0), SE)).toEqual([]);
  });
});

describe("de öppna spannen, som tavlan skuggar efter", () => {
  it("delas av rasten", () => {
    const spans = workingWindows(FRAS, at(0), SE);

    expect(spans).toHaveLength(2);
    expect(clock(new Date(spans[0].from))).toBe("07:00");
    expect(clock(new Date(spans[0].to))).toBe("12:00");
    expect(clock(new Date(spans[1].from))).toBe("12:40");
    expect(clock(new Date(spans[1].to))).toBe("16:00");
  });

  it("är ett enda spann utan raster", () => {
    const spans = workingWindows({ ...FRAS, breaks: [] }, at(0), SE);
    expect(spans).toHaveLength(1);
  });

  it("är tomma för en stängd dag", () => {
    expect(workingWindows(null, at(0), SE)).toEqual([]);
  });
});

describe("rutans slut", () => {
  it("hoppar över lunchen", () => {
    // HELA POÄNGEN MED ARBETSMINUTER. Fyra timmar från 10:00 slutar 14:40 på
    // väggen, eftersom maskinen står still 12:00–12:40.
    expect(clock(blockEnd(FRAS, at(10), 240, SE))).toBe("14:40");
  });

  it("rör inte en ruta som ligger helt före rasten", () => {
    expect(clock(blockEnd(FRAS, at(8), 120, SE))).toBe("10:00");
  });

  it("rör inte en ruta som ligger helt efter rasten", () => {
    expect(clock(blockEnd(FRAS, at(13), 120, SE))).toBe("15:00");
  });

  it("slutar precis när rasten börjar", () => {
    // Gränsfall: rutan tar slut i samma ögonblick lunchen börjar. Den ska inte
    // få fyrtio minuter påskjutna för en rast den aldrig nådde.
    expect(clock(blockEnd(FRAS, at(10), 120, SE))).toBe("12:00");
  });

  it("skjuter fram en ruta som lagts inne i rasten", () => {
    // Den som släpper en ruta mitt i lunchen menar att jobbet börjar när
    // lunchen är slut, inte att maskinen går under den.
    expect(clock(blockEnd(FRAS, at(12, 10), 60, SE))).toBe("13:40");
  });

  it("räknar tid efter stängning som arbete", () => {
    // Överbokning. Fyra timmar från 15:00 slutar 19:00, inte 16:00 — tavlan
    // varnar i gult, men minuterna är riktiga.
    expect(clock(blockEnd(FRAS, at(15), 240, SE))).toBe("19:00");
  });

  it("räknar tid före öppning som arbete", () => {
    // Samma regel i andra änden. En ruta lagd 05:00 ska inte ritas som om den
    // tog en tvåtimmarspaus direkt.
    expect(clock(blockEnd(FRAS, at(5), 60, SE))).toBe("06:00");
  });

  it("räknar hela rutan som arbete på en stängd dag", () => {
    expect(clock(blockEnd(null, at(9), 180, SE))).toBe("12:00");
  });

  it("kapas vid midnatt", () => {
    // En ruta får inte spänna över två dagar. Fem timmar från 22:00 slutar vid
    // dygnets slut, och återstoden ligger kvar som oplacerad.
    const end = blockEnd(FRAS, at(22), 300, SE);
    const wall = wallTimeIn(end, SE);

    expect(wall.day).toBe(7);
    expect(clock(end)).toBe("00:00");
  });
});

describe("arbetsminuter mellan två tidpunkter", () => {
  it("är spannet minus rasten i det", () => {
    expect(workingMinutesBetween(FRAS, at(10), at(14, 40), SE)).toBe(240);
  });

  it("är hela spannet när ingen rast ligger i det", () => {
    expect(workingMinutesBetween(FRAS, at(8), at(10), SE)).toBe(120);
  });

  it("är noll när sluttiden inte ligger efter starttiden", () => {
    expect(workingMinutesBetween(FRAS, at(10), at(10), SE)).toBe(0);
    expect(workingMinutesBetween(FRAS, at(10), at(9), SE)).toBe(0);
  });

  it("är motsatsen till blockEnd", () => {
    // Den viktiga egenskapen: drar man en ruta till ett klockslag och läser
    // tillbaka var den slutar ska man få samma klockslag. Går de två isär
    // kryper en ruta varje gång den flyttas.
    for (const minutes of [15, 60, 240, 500, 600]) {
      const end = blockEnd(FRAS, at(10), minutes, SE);
      expect(workingMinutesBetween(FRAS, at(10), end, SE)).toBe(minutes);
    }
  });
});

describe("hur mycket som ryms från en starttid", () => {
  it("kapar draget mot midnatt", () => {
    // 22:00 till midnatt är två timmar, och inga raster ligger där.
    expect(fitsFrom(FRAS, at(22), SE)).toBe(120);
  });

  it("räknar bort rasten som ligger framför", () => {
    // 11:00 till midnatt är tretton timmar minus fyrtio minuters lunch.
    expect(fitsFrom(FRAS, at(11), SE)).toBe(13 * 60 - 40);
  });

  it("ger 23 timmar dygnet klockan ställs fram", () => {
    // Sista söndagen i mars 2026. Dygnet är 23 timmar långt, och den som
    // räknar 86 400 000 millisekunder landar en timme fel just den natten.
    expect(fitsFrom(null, at(0, 0, 29, 3), SE)).toBe(23 * 60);
  });

  it("ger 25 timmar dygnet klockan ställs tillbaka", () => {
    // Sista söndagen i oktober 2026.
    expect(fitsFrom(null, at(0, 0, 25, 10), SE)).toBe(25 * 60);
  });
});

describe("snäppningen", () => {
  it("rundar till närmaste kvart", () => {
    expect(snap(22)).toBe(15);
    expect(snap(23)).toBe(30);
    expect(snap(240)).toBe(240);
  });

  it("ger aldrig en ruta utan längd", () => {
    // En ruta på noll minuter är inte en ruta. Den som drar ihop en helt ska
    // ta bort den, inte lämna en osynlig rad i databasen.
    expect(snap(0)).toBe(SNAP_MINUTES);
    expect(snap(-30)).toBe(SNAP_MINUTES);
    expect(snap(7)).toBe(SNAP_MINUTES);
  });

  it("snäpper en tidpunkt räknat från dygnets början på väggen", () => {
    expect(clock(snapInstant(at(10, 7), SE))).toBe("10:00");
    expect(clock(snapInstant(at(10, 8), SE))).toBe("10:15");
    expect(clock(snapInstant(at(10, 30), SE))).toBe("10:30");
  });
});

describe("tidsaxeln en dag ritas på", () => {
  const KVALL: StationHours = {
    weekday: 2,
    startMinute: 8 * 60,
    endMinute: 20 * 60,
    breaks: [],
  };

  it("är den vidaste av stationernas tider", () => {
    // Varje rad med sin egen skala vore oläsbart: två rutor på samma klockslag
    // skulle ligga på olika x-läge.
    expect(dayWindow([FRAS, KVALL], [], at(0), SE)).toEqual({
      startMinute: 7 * 60,
      endMinute: 20 * 60,
    });
  });

  it("sträcks ut av en överbokad ruta", () => {
    // En ruta som går till 21:00 måste synas, annars är varningen om
    // överbokning det enda man ser av den.
    const window = dayWindow(
      [FRAS],
      [{ startsAt: at(15), minutes: 360, hours: FRAS }],
      at(0),
      SE
    );

    expect(window.startMinute).toBe(7 * 60);
    expect(window.endMinute).toBe(21 * 60);
  });

  it("faller tillbaka på en arbetsdag när ingenting finns", () => {
    // En tom tavla ska se ut som en arbetsdag och inte som en nollbred kolumn.
    expect(dayWindow([], [], at(0), SE)).toEqual({
      startMinute: 6 * 60,
      endMinute: 18 * 60,
    });
    expect(dayWindow([null, undefined], [], at(0), SE)).toEqual({
      startMinute: 6 * 60,
      endMinute: 18 * 60,
    });
  });

  it("bryr sig inte om rutor på andra dagar", () => {
    const window = dayWindow(
      [FRAS],
      [{ startsAt: at(20, 0, 7), minutes: 120, hours: FRAS }],
      at(0),
      SE
    );

    expect(window.endMinute).toBe(16 * 60);
  });
});

describe("stationens belastning en dag", () => {
  it("summerar planerad tid och jämför med kapaciteten", () => {
    const load = stationDayLoad(
      FRAS,
      [
        { startsAt: at(7), minutes: 300, hours: FRAS },
        { startsAt: at(12, 40), minutes: 200, hours: FRAS },
      ],
      SE
    );

    expect(load.plannedMinutes).toBe(500);
    expect(load.capacityMinutes).toBe(500);
    expect(load.overlaps).toBe(false);
  });

  it("flaggar överbokad tid utan att vägra den", () => {
    const load = stationDayLoad(
      FRAS,
      [{ startsAt: at(7), minutes: 700, hours: FRAS }],
      SE
    );

    expect(load.plannedMinutes).toBeGreaterThan(load.capacityMinutes);
    expect(load.overlaps).toBe(false);
  });

  it("flaggar två rutor som ligger i varandra", () => {
    // Det allvarligare av de två felen: maskinen kan inte köra två jobb
    // samtidigt, och därför räknas det för sig.
    const load = stationDayLoad(
      FRAS,
      [
        { startsAt: at(8), minutes: 120, hours: FRAS },
        { startsAt: at(9), minutes: 60, hours: FRAS },
      ],
      SE
    );

    expect(load.overlaps).toBe(true);
  });

  it("räknar rutor som möts kant i kant som fria", () => {
    const load = stationDayLoad(
      FRAS,
      [
        { startsAt: at(8), minutes: 120, hours: FRAS },
        { startsAt: at(10), minutes: 60, hours: FRAS },
      ],
      SE
    );

    expect(load.overlaps).toBe(false);
  });
});
