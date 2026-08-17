import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";

/**
 * SKAL FÖR DE RÄTTSLIGA SIDORNA.
 *
 * Integritetspolicy, villkor och biträdesavtal. Tre dokument som läses av tre
 * olika skäl — av en kund som utvärderar, av en jurist som granskar, och av
 * någon som redan är kund och vill veta vad som gäller.
 *
 * Därför en smal spalt, tydliga rubriker och en innehållsförteckning: de här
 * texterna skummas efter ett visst stycke oftare än de läses från början.
 *
 * Sidorna ligger på säljadressen och inte i panelen, eftersom de ska gå att
 * läsa innan man blir kund. De behöver också gå att länka till utifrån — Stripe
 * kräver adresser till villkor och integritetspolicy för kundportalen.
 */

export interface Section {
  id: string;
  heading: string;
  body: ReactNode;
}

export default function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: ReactNode;
  /** Datum i klartext. Ett odaterat avtal går inte att hänvisa till. */
  updated: string;
  sections: Section[];
}) {
  return (
    <div className="bg-white">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
          TERAFALK AB
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h1>
        <p className="mt-2 text-[13px] text-neutral-500">
          Senast uppdaterad {updated}
        </p>

        <div className="mt-8 text-[15px] leading-relaxed text-neutral-600">
          {intro}
        </div>

        {/* Innehållsförteckning. Dokumenten är långa och läses styckvis. */}
        <nav className="mt-10 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Innehåll
          </p>
          <ol className="mt-3 space-y-1.5">
            {sections.map((section, index) => (
              <li key={section.id} className="text-[13px]">
                <a
                  href={`#${section.id}`}
                  className="text-neutral-600 hover:text-neutral-900"
                >
                  <span className="mr-2 tabular-nums text-neutral-400">
                    {index + 1}.
                  </span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                <span className="mr-2 tabular-nums text-neutral-400">
                  {index + 1}.
                </span>
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-neutral-600">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-sm font-medium text-neutral-900">Frågor om detta</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
            Kontakta{" "}
            <a
              href="mailto:support@tikkr.se"
              className="font-medium text-blue-600 hover:underline"
            >
              support@tikkr.se
            </a>
            . Övriga dokument:{" "}
            <Link href="/villkor" className="text-blue-600 hover:underline">
              användarvillkor
            </Link>
            ,{" "}
            <Link
              href="/integritetspolicy"
              className="text-blue-600 hover:underline"
            >
              integritetspolicy
            </Link>{" "}
            och{" "}
            <Link
              href="/personuppgiftsbitradesavtal"
              className="text-blue-600 hover:underline"
            >
              personuppgiftsbiträdesavtal
            </Link>
            .
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Punktlista med samma utseende i alla tre dokumenten. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index} className="list-disc text-[15px] leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Tabell för uppräkningar där två kolumner läser bättre än löpande text. */
export function Definitions({
  rows,
}: {
  rows: { term: ReactNode; description: ReactNode }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200">
      <table className="w-full text-left text-[14px]">
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-neutral-100 last:border-0"
            >
              <th
                scope="row"
                className="w-1/3 bg-neutral-50 px-4 py-3 align-top font-medium text-neutral-900"
              >
                {row.term}
              </th>
              <td className="px-4 py-3 align-top leading-relaxed text-neutral-600">
                {row.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
