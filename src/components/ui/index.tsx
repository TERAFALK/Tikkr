import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * DESIGNSYSTEMET.
 *
 * Byggstenarna som alla adminvyer sätts ihop av. Ska en knapp ändras ändras den
 * på ett ställe — det är skillnaden mellan en app som ser sammanhållen ut och
 * en som ser hopplockad ut.
 *
 * Formspråket är inspirerat av verktyg som Twenty CRM: stramt och kompakt,
 * tunna ljusa linjer istället för skuggor, små rundningar, tät typografi och
 * mycket sparsam färg. Idén är att gränssnittet ska försvinna och innehållet
 * synas. En yta full av färg och skuggor konkurrerar med siffrorna, och det är
 * siffrorna man är här för.
 *
 * Färgregler som gäller överallt:
 *   blå   = något går att göra här
 *   grön  = pågår just nu
 *   gul   = kräver din uppmärksamhet
 *   röd   = går inte att ångra
 * Allt annat är gråskala.
 */

/* -------------------------------------------------------------------------- */
/* Sidhuvud                                                                    */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-neutral-500">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-400">
        {children}
      </h2>
      {hint && <p className="mt-1 text-[13px] text-neutral-500">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Knappar                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonTone = "primary" | "secondary" | "danger" | "ghost";

const buttonStyles: Record<ButtonTone, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs",
  secondary:
    "bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50",
  danger:
    "bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50",
  ghost: "text-neutral-600 hover:bg-neutral-100",
};

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 " +
  "text-[13px] font-medium transition-colors disabled:cursor-not-allowed " +
  "disabled:opacity-50 focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-1 focus-visible:outline-blue-600";

export function Button({
  tone = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { tone?: ButtonTone }) {
  return (
    <button {...props} className={`${buttonBase} ${buttonStyles[tone]} ${className}`} />
  );
}

export function ButtonLink({
  tone = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { tone?: ButtonTone }) {
  return (
    <Link {...props} className={`${buttonBase} ${buttonStyles[tone]} ${className}`} />
  );
}

/* -------------------------------------------------------------------------- */
/* Ytor                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-white ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-neutral-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "active" | "warning";
  icon?: ReactNode;
}) {
  const valueTone = {
    neutral: "text-neutral-900",
    active: "text-emerald-600",
    warning: "text-amber-600",
  }[tone];

  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-neutral-400">
        {icon}
        <p className="text-[13px] font-medium text-neutral-500">{label}</p>
      </div>
      {/* tabular-nums ger alla siffror samma bredd, så tal går att jämföra
          med blicken istället för att hoppa i sidled mellan raderna. */}
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulärfält                                                                */
/* -------------------------------------------------------------------------- */

const fieldStyles =
  "block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] " +
  "text-neutral-900 ring-1 ring-inset ring-neutral-200 " +
  "placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-neutral-700">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs leading-relaxed text-neutral-500">
          {hint}
        </span>
      )}
    </label>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${fieldStyles} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${fieldStyles} ${className}`} />;
}

/* -------------------------------------------------------------------------- */
/* Tabell                                                                      */
/* -------------------------------------------------------------------------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric,
}: {
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-neutral-200 bg-neutral-50/70 px-4 py-2 text-xs font-medium text-neutral-500 ${
        numeric ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric,
  muted,
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  muted?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-4 py-2.5 align-middle ${
        numeric ? "text-right tabular-nums" : "text-left"
      } ${muted ? "text-neutral-500" : "text-neutral-900"}`}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  dimmed,
}: {
  children: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <tr
      className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50/70 ${
        dimmed ? "bg-neutral-50/50 text-neutral-400" : ""
      }`}
    >
      {children}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Småting                                                                     */
/* -------------------------------------------------------------------------- */

type BadgeTone = "neutral" | "active" | "warning" | "muted";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-neutral-100 text-neutral-600 ring-neutral-200",
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    muted: "bg-neutral-50 text-neutral-400 ring-neutral-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Tom vy.
 *
 * En tom lista utan förklaring får folk att tro att något är trasigt. Här står
 * alltid vad man gör härnäst.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-6 py-14 text-center">
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-neutral-500">
        {description}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "warning";
  children: ReactNode;
}) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-neutral-200 bg-neutral-50 text-neutral-600",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <div
      className={`rounded-md border px-3 py-2.5 text-[13px] leading-relaxed ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
