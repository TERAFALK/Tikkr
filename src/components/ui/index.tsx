import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { TimeInput } from "./TimeInput";

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
 *   Fjord = något går att göra här   (knappar, markerat läge, kryssrutor)
 *   grön  = pågår just nu            (instämplad, sparat, positivt saldo)
 *   gul   = kräver din uppmärksamhet
 *   röd   = går inte att ångra
 * Allt annat är gråskala, och gråskalan är Snö → Lav → Skiffer → Fjord.
 *
 * Färgerna är varumärkets sex, och de ligger som Tailwind-tokens i
 * src/app/globals.css. Där står också varför `blue-*` numera är Fjord och
 * `emerald-*` varumärkets grönt. Grönt är ACCENT och aldrig huvudfärg — det är
 * därför Fjord och inte grönt bär knapparna.
 *
 * Länkad text är det enda undantaget. Fjord ligger för nära brödtexten för att
 * en länk skulle gå att se, så inline-länkar får accentgrönt (`text-tick-deep`).
 */

/* -------------------------------------------------------------------------- */
/* Rutor                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * YTAN EN RUTA RITAS PÅ, OCH DEN SOM GÖR ATT KNAPPARNA ALLTID SYNS.
 *
 * En ruta växer med sitt innehåll — lägger man till tre arbetsmoment blir den
 * tre rader högre. Utan takhöjd växer den förbi fönsterkanten, och då hamnar
 * Spara utanför bild. Man ser ett formulär som inte går att skicka, vilket
 * läses som att sparandet är trasigt.
 *
 * Därför: rutan blir aldrig högre än fönstret, och det är FÄLTEN som skrollar.
 * Rubriken och knappraden står still. Knappen man letar efter ligger alltid på
 * samma ställe, oavsett hur långt formuläret blivit.
 *
 * `open:flex` och inte `flex`: en stängd `<dialog>` göms av webbläsarens egen
 * `display: none`, och ett `display: flex` från oss skulle vinna över den och
 * visa varenda ruta på sidan hela tiden. Varianten gäller bara när rutan är
 * öppen, och då finns ingen `display: none` att krocka med.
 *
 * Bredden står kvar på varje ruta för sig. Den skiljer sig mellan rutorna, och
 * Tailwind måste kunna läsa klassen som text i filen för att bygga den alls.
 */
export const dialogSurface =
  "max-h-[calc(100dvh-2rem)] open:flex open:flex-col overflow-hidden " +
  "rounded-xl border border-neutral-200 bg-white p-0 shadow-xl " +
  "backdrop:bg-neutral-900/40";

/** Fältdelen av en ruta: den enda del som skrollar. */
export const dialogBody = "min-h-0 flex-1 overflow-y-auto";

/** Rubrik- och knapprad: står still medan fälten skrollar. */
export const dialogEdge = "shrink-0";

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

/**
 * 16 px på en telefon, 13 px därifrån och uppåt.
 *
 * Safari på iPhone zoomar in hela sidan när man trycker i ett fält med mindre
 * text än 16 px, och zoomar inte ut igen. Varje formulär i panelen hamnade
 * därmed halvvägs utanför skärmen så fort man började skriva.
 */
/*
 * RAMEN ÄR SYNLIG MED FLIT.
 *
 * Stod på Lav (`neutral-200`), som är linjefärgen i varumärkesguiden. Mot vitt
 * ger den en kontrast på ungefär 1,3:1 — ett fält såg ut som en vit yta utan
 * kant, och kunden hörde av sig om att det inte gick att se vad som gick att
 * fylla i. `neutral-400` ligger på drygt 3:1 och är den nivå WCAG begär för
 * kanten på en kontroll man ska kunna urskilja.
 *
 * Lav är kvar som linje mellan rader och runt kort. Där är den rätt: en linje
 * som delar av är inte en kant man ska träffa med fingret.
 *
 * ── FOKUSRINGEN RITAS EN GÅNG, INTE TVÅ ─────────────────────────────────
 *
 * `focus:outline-hidden` släcker webbläsarens egen fokusram. Utan den ritade
 * Chrome sin `outline: auto` OVANPÅ vår tvåpixelsring, och ett fält man klickat
 * i fick en kant som såg ut som en svart ram runt hela rutan — kunden hörde av
 * sig om just det.
 *
 * `outline-hidden` och inte `outline-none`: den förra lämnar kvar en genomskinlig
 * ram, som blir synlig i Windows högkontrastläge. Där ritas inte vår ring, och
 * ett fält utan synligt fokus går inte att använda med tangentbord.
 */
const fieldBase =
  "rounded-md border-0 bg-white px-2.5 py-1.5 text-base sm:text-[13px] " +
  "text-neutral-900 ring-1 ring-inset ring-neutral-400 " +
  "placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600";

const fieldStyles = `block w-full ${fieldBase}`;

/**
 * Samma fält, men med rött istället för grått. Hela uppsättningen och inte ett
 * tillägg: två ringfärger på samma element avgörs av ordningen i stilmallen.
 */
const fieldInvalid =
  "rounded-md border-0 bg-red-50 px-2.5 py-1.5 text-base sm:text-[13px] " +
  "text-red-900 ring-1 ring-inset ring-red-400 " +
  "placeholder:text-red-300 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-red-600";

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

/**
 * Flerradigt fält.
 *
 * Fanns inte, så varje ställe som behövde ett skrev ut fältklasserna för hand
 * — anteckningen om en kund, driftmeddelandets text, utskickets brödtext. Tre
 * kopior som börjar som "nästan lika".
 */
export function Textarea({
  className = "",
  rows = 4,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea {...props} rows={rows} className={`${fieldStyles} ${className}`} />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${fieldStyles} ${className}`} />;
}

/**
 * Klockslagsfält. Sätter kolonet själv och blir rött på ett otolkbart värde —
 * se `TimeInput`.
 *
 * Smalare än ett vanligt fält: fyra siffror behöver inte halva formuläret.
 */
export function TimeField({
  className = "",
  ...props
}: ComponentProps<typeof TimeInput>) {
  const shape = `w-24 text-center tabular-nums ${className}`;

  return (
    <TimeInput
      {...props}
      className={`${fieldBase} ${shape}`}
      invalidClassName={`${fieldInvalid} ${shape}`}
    />
  );
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
  /** Skrivs bara när den säger något rubriken inte gör. Se CLAUDE.md § 7.1. */
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-6 py-14 text-center">
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-neutral-500">
          {description}
        </p>
      )}
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
