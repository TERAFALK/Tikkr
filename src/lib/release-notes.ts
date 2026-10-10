import type { ModuleKey } from "./modules";

/**
 * NYHETERNA, en post per version (issue #6, tillagt 2026-10-10).
 *
 * Det kunden läser under Nyheter i panelen. Ligger i koden och inte i
 * databasen, av tre skäl:
 *
 * 1. **Texten granskas som koden.** Ett utkast skrivs i en egen PR före
 *    taggningen, och den som slår ihop PR:en har godkänt texten.
 * 2. **Den syns när versionen installeras, och inte förr.** Filen följer med
 *    imagen, och news.ts gömmer dessutom poster för versioner som är nyare än
 *    den som kör. Ingen knapp att komma ihåg att trycka på.
 * 3. **Ingen adminyta att bygga.** Plattformspanelen har driftmeddelanden;
 *    det här är något annat, och det behöver ingen egen redigering.
 *
 * SKRIVS FÖR EN VERKSTADSCHEF. Vad som går att göra nu, inte hur det byggts.
 * Tekniska ändringar som kunden inte märker står inte här alls. Samma
 * språkregler som resten av gränssnittet, se TONE-OF-VOICE.md: hela meningar
 * med punkt, inga tankstreck, inga utropstecken.
 *
 * NYAST ÖVERST. `tests/news.test.ts` fäller fel ordning, en version som står
 * två gånger och en version som inte är vX.Y.Z.
 *
 * En punkt som bara rör ett tillval bär modulens nyckel och visas bara för
 * kunder som har det. En release där ingen punkt återstår visas inte alls.
 */

/** En punkt. Med `module` syns den bara för kunder med det tillvalet. */
export type NewsItem = string | { text: string; module: ModuleKey };

export interface Release {
  /** Taggen, t.ex. "v1.2.0". */
  version: string;
  /** Dagen versionen installeras i produktionen, "ÅÅÅÅ-MM-DD". */
  date: string;
  /** Rubrik, ett substantiv eller en kort fras. */
  title: string;
  /** En mening om versionen i stort. Valfri. */
  summary?: string;
  added?: NewsItem[];
  improved?: NewsItem[];
  fixed?: NewsItem[];
}

export const RELEASES: Release[] = [
  {
    version: "v1.0.0",
    date: "2026-10-10",
    title: "Tikkr i drift",
    added: [
      "Nyheter i menyn, med vad som ändrats i varje version.",
      {
        text: "Komptid beslutas per dag på tidrapporten, med en egen knapp bredvid Frånvaro.",
        module: "PAYROLL",
      },
    ],
    improved: [
      {
        text: "Frånvaro och komptid tas bort i den utfällda dagen på tidrapporten.",
        module: "PAYROLL",
      },
    ],
  },
];
