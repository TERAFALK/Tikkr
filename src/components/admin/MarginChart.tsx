import { formatCurrency } from "@/lib/money";
import type { CustomerMonth } from "@/lib/customers";

/**
 * MARGINAL PER MÅNAD.
 *
 * Svarar på om en kund växer eller tynar, vilket summan inte gör. En kund som
 * gav 200 000 kr totalt kan ha gett allt för två år sedan.
 *
 * RITYTAN HAR EN BESTÄMD HÖJD I PIXLAR, och staplarna räknas i pixlar mot den.
 * Procenthöjder löses mot förälderns höjd, och en flex-kolumn utan bestämd
 * höjd ger då noll — intäktsgrafen i plattformsvyn ritade inga staplar alls av
 * just det skälet.
 *
 * NEGATIV MARGINAL RITAS NEDÅT. En förlustmånad som såg ut som en kort stapel
 * uppåt vore att dölja det enda på grafen man verkligen behöver se.
 */

const PLOT_HEIGHT = 140;

export default function MarginChart({ months }: { months: CustomerMonth[] }) {
  const peak = Math.max(
    ...months.map((month) => Math.abs(month.marginOre)),
    1
  );

  const hasAny = months.some((month) => month.marginOre !== 0);

  if (!hasAny) {
    return (
      <p className="px-5 py-6 text-[13px] text-neutral-500">
        Ingen marginal att visa. Antingen saknas timkostnader, eller så har
        ingen tid registrerats på kundens ordrar de senaste tolv månaderna.
      </p>
    );
  }

  // Finns en förlustmånad delas ytan på mitten. Annars får staplarna hela
  // höjden — en nollinje mitt i bilden när allt är positivt vore bortkastad
  // halva grafen.
  const hasLoss = months.some((month) => month.marginOre < 0);
  const upHeight = hasLoss ? PLOT_HEIGHT * 0.65 : PLOT_HEIGHT;
  const downHeight = hasLoss ? PLOT_HEIGHT * 0.35 : 0;

  return (
    <div className="p-5">
      <div className="flex gap-1.5">
        {months.map((month, index) => {
          const share = Math.abs(month.marginOre) / peak;
          const positive = month.marginOre >= 0;

          return (
            <div
              key={`${month.label}-${index}`}
              className="group flex min-w-0 flex-1 flex-col items-center"
            >
              <span className="mb-1 h-4 text-[10px] tabular-nums text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
                {month.marginOre === 0 ? "" : formatCurrency(month.marginOre)}
              </span>

              <div
                className="flex w-full flex-col justify-end"
                style={{ height: upHeight }}
              >
                {positive && (
                  <div
                    className="w-full rounded-t bg-emerald-600/85 transition-colors group-hover:bg-emerald-600"
                    style={{
                      height: Math.max(
                        month.marginOre === 0 ? 0 : 2,
                        Math.round(share * upHeight)
                      ),
                    }}
                    title={`${month.label}: ${formatCurrency(month.marginOre)}`}
                  />
                )}
              </div>

              {hasLoss && (
                <div className="w-full" style={{ height: downHeight }}>
                  {!positive && (
                    <div
                      className="w-full rounded-b bg-amber-600/85 transition-colors group-hover:bg-amber-600"
                      style={{
                        height: Math.max(2, Math.round(share * downHeight)),
                      }}
                      title={`${month.label}: ${formatCurrency(month.marginOre)}`}
                    />
                  )}
                </div>
              )}

              <span className="mt-1.5 truncate text-[10px] text-neutral-400">
                {month.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
