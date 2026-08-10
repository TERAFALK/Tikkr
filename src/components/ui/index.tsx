import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * DESIGNSYSTEMET.
 *
 * Byggstenarna som alla adminvyer sätts ihop av. Anledningen att de ligger
 * samlade här och inte skrivs om per sida: det är skillnaden mellan en app som
 * ser sammanhållen ut och en som ser hopplockad ut. Ska en knapp ändras ändras
 * den på ett ställe.
 *
 * Riktning: ljust och stramt. Vit yta, gråskala, mörkblått för handling och
 * grönt för pågående arbete. Färg används sparsamt — när allt är färgglatt
 * betyder ingenting något.
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Knappar                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonTone = "primary" | "secondary" | "danger";

const buttonStyles: Record<ButtonTone, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50",
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm " +
  "font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-slate-900";

export function Button({
  tone = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { tone?: ButtonTone }) {
  return (
    <button
      {...props}
      className={`${buttonBase} ${buttonStyles[tone]} ${className}`}
    />
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
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "active" | "warning";
}) {
  const valueTone = {
    neutral: "text-slate-900",
    active: "text-emerald-700",
    warning: "text-amber-700",
  }[tone];

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {/* tabular-nums ger alla siffror samma bredd, så tal går att jämföra
          med blicken istället för att hoppa i sidled. */}
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulärfält                                                                */
/* -------------------------------------------------------------------------- */

const fieldStyles =
  "block w-full rounded-lg border-0 py-2 px-3 text-slate-900 shadow-sm " +
  "ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 " +
  "focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm";

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
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
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
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {children}
      </table>
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
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
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
}: {
  children: ReactNode;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 ${numeric ? "text-right tabular-nums" : "text-left"} ${
        muted ? "text-slate-500" : "text-slate-900"
      }`}
    >
      {children}
    </td>
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
    neutral: "bg-slate-100 text-slate-700",
    active: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    muted: "bg-slate-100 text-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
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
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="text-base font-medium text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
