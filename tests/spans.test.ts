import { describe, it, expect } from "vitest";
import { mainMinutes } from "@/lib/spans";

/**
 * Arbetad tid när flera jobb löper samtidigt.
 *
 * Rapporterna summerar rakt av: två maskiner en timme är två maskintimmar, och
 * båda ordrarna betalar sin. Tidrapporten, översikten och veckovyn räknar i
 * stället tiden då MINST ETT jobb pågick. Ett dubbeljobb lägger ingenting till
 * medan det underliggande jobbet pågår, men tiden efter räknas.
 *
 * Regeln ändrades 2026-11-23. Till dess räknades ett dubbeljobb inte alls,
 * inte ens timmarna efter att det första jobbet stämplats ut, och pilotkunden
 * såg arbetad tid försvinna ur löneunderlaget.
 *
 * Går den här filen sönder börjar vyerna säga olika saker om samma dag utan
 * att någon förstår varför.
 */

const HOUR = 60 * 60 * 1000;

/** Klockslag samma dygn, som millisekunder. Gör passen läsbara. */
function span(fromHour: number, toHour: number) {
  return { from: fromHour * HOUR, to: toHour * HOUR };
}

describe("ett jobb i taget", () => {
  it("ger noll när inget registrerats", () => {
    expect(mainMinutes([])).toBe(0);
  });

  it("räknar ett ensamt pass rakt av", () => {
    expect(mainMinutes([span(8, 12)])).toBe(240);
  });

  it("lägger ihop pass som inte rör varandra", () => {
    expect(mainMinutes([span(8, 12), span(13, 17)])).toBe(480);
  });

  it("bryr sig inte om vilken ordning passen kommer i", () => {
    expect(mainMinutes([span(13, 17), span(8, 12)])).toBe(480);
  });

  it("räknar inte ett pass utan längd", () => {
    // En instämpling som ångrats i samma sekund. Finns i databasen, men är
    // ingen tid.
    expect(mainMinutes([span(8, 8)])).toBe(0);
  });

  it("kant i kant är två huvudjobb", () => {
    // Utstämpling och instämpling i samma ögonblick vid ett jobbyte. Det andra
    // jobbet började inte medan något pågick, alltså är det ett huvudjobb.
    expect(mainMinutes([span(8, 12), span(12, 16)])).toBe(480);
  });
});

describe("dubbeljobb räknas en gång", () => {
  it("fräsen som startas mitt i svetsningen räknas efter att svetsen slutat", () => {
    // Svets 08–12 och fräs 11–15. Dagen är sju timmar, inte åtta: den
    // överlappande timmen räknas en gång. Personen var på plats till 15.
    //
    // Svarade 240 till 2026-11-23, alltså bara svetsen.
    expect(mainMinutes([span(8, 12), span(11, 15)])).toBe(420);
  });

  it("pilotkundens dag: in, ut, in igen och ett dubbeljobb", () => {
    // 07–08, ut, in 09–12 och dubbeljobbet 10–14. Det andra passet stämplas
    // ut först, och dubbeljobbet fortsätter. Allt utom överlappet räknas:
    // 1 + 5 timmar.
    expect(mainMinutes([span(7, 8), span(9, 12), span(10, 14)])).toBe(360);
  });

  it("ett jobb helt inuti ett annat lägger ingenting till", () => {
    expect(mainMinutes([span(8, 16), span(10, 12)])).toBe(480);
  });

  it("tre pass ovanpå varandra räknas som ett", () => {
    expect(mainMinutes([span(8, 12), span(8, 12), span(8, 12)])).toBe(240);
  });

  it("två jobb som startar samtidigt: det längsta räknas", () => {
    // Personen var på plats till 16, inte till 12.
    //
    // Svarade 240 till 2026-10-05, alltså det pass som råkade stå först i
    // listan. Se nästa test för varför det inte dög.
    expect(mainMinutes([span(8, 12), span(8, 16)])).toBe(480);
  });

  /**
   * SAMMA PASS I EN ANNAN ORDNING SKA GE SAMMA SVAR.
   *
   * Passen kommer ur en databasfråga som sorterar på `clock_in_at` och
   * ingenting mer. Postgres lovar ingenting om ordningen mellan rader som är
   * lika, så två identiska frågor kan ge dem i olika följd — och gjorde det:
   * samma vecka visade 6:51 ena gången och 3:23 den andra.
   */
  it("ordningen i listan ändrar inte svaret", () => {
    const a = span(8, 12);
    const b = span(8, 16);
    const c = span(8, 14);

    const svar = [
      mainMinutes([a, b, c]),
      mainMinutes([c, a, b]),
      mainMinutes([b, c, a]),
      mainMinutes([c, b, a]),
    ];

    expect(new Set(svar)).toEqual(new Set([480]));
  });

  it("ett jobb inuti ett dubbeljobb lägger ingenting till", () => {
    // Svets 08–12, fräs 11–18, borr 13–14. Borren gick medan fräsen gick,
    // så dagen är 08–18.
    expect(mainMinutes([span(8, 12), span(11, 18), span(13, 14)])).toBe(600);
  });

  it("ett uppehåll mellan jobben räknas inte", () => {
    // Svets 08–12, fräs 11–15, montering 16–18. Ingenting pågick 15–16:
    // 7 + 2 timmar.
    expect(mainMinutes([span(8, 12), span(11, 15), span(16, 18)])).toBe(540);
  });
});

/**
 * HELA MINUTER.
 *
 * En stämpling bär sekunder, eftersom den sätts när någon trycker. Flexsaldot
 * lagras som hela minuter och läses tillbaka, och utan avrundningen här gick
 * en justering inte ihop: administratören skrev 2 och fick 1,99.
 */
describe("sekunderna avrundas bort", () => {
  const SECOND = 1000;

  it("ett pass på 59 sekunder är en minut", () => {
    expect(mainMinutes([{ from: 0, to: 59 * SECOND }])).toBe(1);
  });

  it("ett pass på 29 sekunder är noll minuter", () => {
    expect(mainMinutes([{ from: 0, to: 29 * SECOND }])).toBe(0);
  });

  it("avrundningen sker en gång på summan, inte per pass", () => {
    // Tre pass på 40 sekunder var. Per pass hade var och en blivit en minut,
    // alltså tre. Summan är två minuter, och det är svaret: felet ska inte
    // växa med antalet stämplingar.
    expect(
      mainMinutes([
        { from: 0, to: 40 * SECOND },
        { from: 60 * SECOND, to: 100 * SECOND },
        { from: 120 * SECOND, to: 160 * SECOND },
      ])
    ).toBe(2);
  });

  it("hela minuter lämnas i fred", () => {
    expect(mainMinutes([span(6.5, 16)])).toBe(570);
  });
});
