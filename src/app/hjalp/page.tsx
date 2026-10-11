import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { helpSiteUrl } from "@/lib/site-url";
import { HELP_AREAS, HELP_AREA_KEYS } from "@/lib/help/areas";
import { GUIDES, guideBySlug, guideHref, type Guide } from "@/lib/help/guides";
import { HELP_FAQ } from "@/lib/help/faq";
import { MODULES } from "@/lib/modules";
import HelpShell from "@/components/help/HelpShell";
import HelpSearch from "@/components/help/HelpSearch";

/**
 * Byggs om varje minut, likt säljsidan, för driftmeddelanderemsan i
 * SiteHeader. Guiderna själva ändras bara vid en driftsättning.
 */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  path: "/hjalp",
  base: helpSiteUrl(),
  title: "Hjälpcenter · Tikkr",
  description:
    "Guider för stämplingsskärmen, ordrar, underlag, löneunderlag och " +
    "planering i Tikkr, och vägen till support.",
});

/**
 * HJÄLPCENTRETS STARTSIDA.
 *
 * Sökfältet överst och därunder alla guider, grupperade per område. Hela
 * listan står utfälld: tjugofem rubriker går att skumma, och den som inte vet
 * vad saken heter hittar den lättare genom att läsa rubrikerna än genom att
 * gissa ett sökord.
 */
export default function HelpPage() {
  const guides = GUIDES as readonly Guide[];

  return (
    <HelpShell
      eyebrow="Hjälpcenter"
      title="Guider och support"
      hero={<HelpSearch />}
    >
      <div className="space-y-12">
        {HELP_AREA_KEYS.map((area) => {
          const inArea = guides.filter((guide) => guide.area === area);
          if (inArea.length === 0) return null;

          return (
            <section key={area} aria-labelledby={`omrade-${area}`}>
              <h2
                id={`omrade-${area}`}
                className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400"
              >
                {HELP_AREAS[area].label}
              </h2>

              <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                {inArea.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={guideHref(guide.slug)}
                      className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-neutral-900">
                          {guide.title}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-neutral-500">
                          {guide.summary}
                        </span>
                      </span>
                      {guide.module && (
                        <span className="mt-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">
                          Tillval: {MODULES[guide.module].name}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section aria-labelledby="vanliga-fragor">
          <h2
            id="vanliga-fragor"
            className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400"
          >
            Vanliga frågor
          </h2>

          {/* details-element och ingen JavaScript. Frågorna fälls ut även om
              något annat på sidan inte hunnit laddas. */}
          <div className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {HELP_FAQ.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[15px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-neutral-400 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
                  {item.a}{" "}
                  <Link
                    href={guideHref(item.guide)}
                    className="font-medium text-tick-deep hover:underline"
                  >
                    {guideBySlug(item.guide)?.title}
                  </Link>
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </HelpShell>
  );
}
