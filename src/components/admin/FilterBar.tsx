import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Button, ButtonLink, Card } from "@/components/ui";
import type { DatePreset } from "@/lib/date-presets";
import FilterForm from "./FilterForm";
import WeekStepper from "./WeekStepper";

/**
 * FILTERRADEN I RAPPORTER OCH STÄMPLINGAR.
 *
 * Perioden överst, med veckopilar och snabbval. Därunder de fält man använder
 * oftast, och resten bakom Fler filter. I Rapporter stod åtta fält, fem snabbval
 * och två knappar framme, och listan började under första skärmen.
 *
 * Fler filter är öppet så länge något i det är valt: ett filter som gäller ska
 * inte gömmas.
 *
 * Filtren gäller direkt, se FilterForm. Knappen Visa finns därför bara utan
 * JavaScript. Stod den framme som primär knapp såg det ut som att den behövdes.
 */

/** Ett val i en rad, för period eller status. Markerat läge i Fjord. */
export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-8 ${
        active
          ? "bg-neutral-900 text-white"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
      }`}
    >
      {children}
    </Link>
  );
}

export default function FilterBar({
  week,
  presets,
  current,
  presetHref,
  resetHref,
  columns = "lg:grid-cols-4",
  more,
  moreActive = 0,
  children,
}: {
  week: ComponentProps<typeof WeekStepper>;
  presets: DatePreset[];
  /** Perioden som gäller nu, för att markera rätt snabbval. */
  current: { from?: string; to?: string };
  presetHref: (preset: DatePreset) => string;
  resetHref: string;
  /** Hela klassnamnet, så att Tailwind kan läsa det ur källkoden. */
  columns?: string;
  /** Fälten bakom Fler filter. */
  more?: ReactNode;
  /** Hur många av dem som är valda. */
  moreActive?: number;
  children: ReactNode;
}) {
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-5 py-3">
        <WeekStepper {...week} />

        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <FilterChip
              key={preset.label}
              href={presetHref(preset)}
              active={current.from === preset.from && current.to === preset.to}
            >
              {preset.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <FilterForm className="space-y-4 p-5">
        <div className={`grid gap-4 sm:grid-cols-2 ${columns}`}>{children}</div>

        {more && (
          <details open={moreActive > 0}>
            <summary className="cursor-pointer text-[13px] font-medium text-neutral-700">
              Fler filter{moreActive > 0 ? ` (${moreActive})` : ""}
            </summary>
            <div className={`mt-3 grid gap-4 sm:grid-cols-2 ${columns}`}>
              {more}
            </div>
          </details>
        )}

        <div className="flex items-center gap-2">
          <noscript>
            <Button type="submit">Visa</Button>
          </noscript>
          <ButtonLink href={resetHref} tone="secondary">
            Rensa
          </ButtonLink>
        </div>
      </FilterForm>
    </Card>
  );
}
