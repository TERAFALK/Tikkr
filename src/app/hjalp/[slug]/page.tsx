import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { helpSiteUrl } from "@/lib/site-url";
import { HELP_AREAS } from "@/lib/help/areas";
import { GUIDES, guideBySlug, guideHref } from "@/lib/help/guides";
import { MODULES } from "@/lib/modules";
import HelpShell from "@/components/help/HelpShell";

/** Se startsidan: driftmeddelanderemsan i SiteHeader. */
export const revalidate = 60;

/** Bara guiderna som finns. Allt annat under /hjalp svarar 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return {};

  return pageMetadata({
    path: guideHref(guide.slug),
    base: helpSiteUrl(),
    title: `${guide.title} · Tikkr hjälpcenter`,
    description: guide.summary,
  });
}

/**
 * EN GUIDE.
 *
 * Numrerade steg, och därunder det som är bra att veta. Stegen är det man
 * gör, i den ordning man gör det; anteckningarna är konsekvenser och
 * undantag, som den som bara vill få saken gjord kan hoppa över.
 *
 * Gäller guiden ett tillval står det överst. Den som letar hjälp i en
 * arbetsyta utan tillvalet ska få veta varför menypunkten saknas innan hen
 * letat efter den.
 */
export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();

  const related = (guide.related ?? [])
    .map((slug) => guideBySlug(slug))
    .filter((found) => found !== undefined);

  return (
    <HelpShell
      eyebrow={
        <>
          <Link href="/hjalp" className="hover:text-white">
            Hjälpcenter
          </Link>
          <span aria-hidden="true" className="mx-2 text-neutral-500">
            /
          </span>
          {HELP_AREAS[guide.area].label}
        </>
      }
      title={guide.title}
      lead={guide.summary}
    >
      {guide.module && (
        <p className="mb-8 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13px] text-neutral-600">
          <span className="font-medium text-neutral-900">
            Tillval: {MODULES[guide.module].name}.
          </span>{" "}
          Slås på under Inställningar, Prenumeration.
        </p>
      )}

      <ol className="space-y-6">
        {guide.steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fjord text-[13px] font-semibold tabular-nums text-white"
            >
              {index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[15px] font-medium text-neutral-900">
                {step.title}
              </p>
              {step.body && (
                <p className="mt-1 text-[15px] leading-relaxed text-neutral-600">
                  {step.body}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {guide.notes && guide.notes.length > 0 && (
        <section aria-labelledby="bra-att-veta" className="mt-12">
          <h2
            id="bra-att-veta"
            className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400"
          >
            Bra att veta
          </h2>
          <ul className="mt-3 space-y-2">
            {guide.notes.map((note) => (
              <li
                key={note}
                className="flex gap-3 text-[15px] leading-relaxed text-neutral-600"
              >
                <span
                  aria-hidden="true"
                  className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tick-deep"
                />
                {note}
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="relaterade" className="mt-12">
          <h2
            id="relaterade"
            className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400"
          >
            Relaterade guider
          </h2>
          <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {related.map((other) => (
              <li key={other.slug}>
                <Link
                  href={guideHref(other.slug)}
                  className="block px-5 py-3 text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
                >
                  {other.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </HelpShell>
  );
}
