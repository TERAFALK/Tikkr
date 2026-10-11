import { HELP_AREAS } from "./areas";
import { GUIDES, type Guide } from "./guides";

/**
 * SÖKNINGEN I HJÄLPCENTRET.
 *
 * Körs i webbläsaren över guiderna, som redan finns i koden. Ingen sökserver
 * och inget beroende: tjugofem guider är för få för att något mer avancerat
 * ska löna sig, och svaret kommer medan man skriver.
 *
 * Två saker gör att den hittar det folk menar:
 *
 * 1. **Å, ä och ö jämförs som a och o.** På en surfplatta utan svenskt
 *    tangentbord skriver man "stampla", och den som letar ska inte straffas
 *    för tangentbordet.
 * 2. **Varje ord matchar början av ett ord.** "stäm" hittar "stämpla" och
 *    "stämplingsskärm". Alla sökord måste träffa något i guiden, annars blir
 *    "glömt stämpla ut" en träff på varje guide som innehåller "ut".
 *
 * Rubriken väger tyngst, sedan nyckelorden, sammanfattningen och sist stegen.
 * En guide som heter det man sökte på ska stå först.
 */

export interface SearchHit {
  slug: string;
  title: string;
  summary: string;
  areaLabel: string;
}

/** Gemener, utan diakritiska tecken. "Stämpla Ut" blir "stampla ut". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function words(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

const WEIGHTS = { title: 8, keywords: 5, summary: 3, steps: 1 } as const;

interface IndexedGuide {
  guide: Guide;
  fields: Record<keyof typeof WEIGHTS, string[]>;
}

const INDEX: IndexedGuide[] = (GUIDES as readonly Guide[]).map((guide) => ({
  guide,
  fields: {
    title: words(guide.title),
    keywords: guide.keywords.flatMap(words),
    summary: words(`${guide.summary} ${HELP_AREAS[guide.area].label}`),
    steps: words(
      [
        ...guide.steps.flatMap((step) => [step.title, step.body ?? ""]),
        ...(guide.notes ?? []),
      ].join(" ")
    ),
  },
}));

/**
 * Guiderna som matchar, bäst först. Tom fråga ger inga träffar: listan över
 * områden står redan på sidan.
 */
export function searchGuides(query: string, limit = 8): SearchHit[] {
  const terms = words(query);
  if (terms.length === 0) return [];

  const scored: { hit: IndexedGuide; score: number }[] = [];

  for (const entry of INDEX) {
    let score = 0;
    let everyTermFound = true;

    for (const term of terms) {
      let best = 0;

      for (const field of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
        if (entry.fields[field].some((word) => word.startsWith(term))) {
          best = Math.max(best, WEIGHTS[field]);
        }
      }

      if (best === 0) {
        everyTermFound = false;
        break;
      }

      score += best;
    }

    if (everyTermFound) scored.push({ hit: entry, score });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score || a.hit.guide.title.localeCompare(b.hit.guide.title, "sv")
    )
    .slice(0, limit)
    .map(({ hit: { guide } }) => ({
      slug: guide.slug,
      title: guide.title,
      summary: guide.summary,
      areaLabel: HELP_AREAS[guide.area].label,
    }));
}
