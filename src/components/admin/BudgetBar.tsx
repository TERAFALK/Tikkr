import { formatDuration } from "@/lib/format";

/**
 * HUR MYCKET AV DEN BERÄKNADE TIDEN SOM ÄR UPPARBETAD.
 *
 * Svarar på den fråga en verkstad ställer först av alla när de sett sina
 * rapporter en månad: håller den här ordern budget, eller är den på väg att
 * kosta mer än den ger?
 *
 * Tre lägen med tre färger. Gränsen vid 85 procent är vald för att en varning
 * ska komma medan det fortfarande går att göra något — vid 100 procent är
 * beskedet en efterhandsrapport.
 *
 * Systemet stoppar aldrig stämpling. Ordern får kosta mer än beräknat; det här
 * är information till den som fakturerar, inte en spärr mot att arbeta.
 */

const WARN_AT = 0.85;

export default function BudgetBar({
  budgetMinutes,
  usedMinutes,
  showText = true,
}: {
  budgetMinutes: number | null;
  usedMinutes: number;
  showText?: boolean;
}) {
  if (!budgetMinutes) {
    return <span className="text-[13px] text-neutral-400">—</span>;
  }

  const share = usedMinutes / budgetMinutes;
  const over = usedMinutes > budgetMinutes;

  const tone = over
    ? { bar: "bg-amber-500", text: "text-amber-700" }
    : share >= WARN_AT
      ? { bar: "bg-amber-400", text: "text-amber-700" }
      : { bar: "bg-emerald-500", text: "text-emerald-700" };

  return (
    <div className="min-w-28">
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${tone.bar}`}
          // Stapeln stannar vid full bredd. Överskridandet står i siffror
          // bredvid — en stapel som växer utanför sin ruta säger inte hur
          // mycket, bara att det hänt.
          style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
        />
      </div>

      {showText && (
        <p className="mt-1 text-xs tabular-nums text-neutral-500">
          {Math.round(share * 100)} % av {formatDuration(budgetMinutes)}
          {over && (
            <span className={`ml-1.5 font-medium ${tone.text}`}>
              {formatDuration(usedMinutes - budgetMinutes)} över
            </span>
          )}
        </p>
      )}
    </div>
  );
}
