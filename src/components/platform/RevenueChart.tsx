import { Card, CardHeader } from "@/components/ui";
import type { MonthPoint } from "@/lib/revenue-history";

/**
 * MÅNADSINTÄKTEN ÖVER TID.
 *
 * Staplar byggda av lådor, inte ett diagrambibliotek. Tolv värden behöver
 * ingen ritmotor, och ett bibliotek till hade dragit in flera hundra kilobyte
 * för att rita något som är tre rader CSS.
 *
 * Höjden är relativ det högsta värdet, inte en absolut skala. Frågan panelen
 * ska besvara är "går det uppåt eller nedåt", inte "exakt hur många kronor" —
 * den siffran står ändå i stat-rutan ovanför.
 */
export default function RevenueChart({ points }: { points: MonthPoint[] }) {
  // Under två mätpunkter finns ingen utveckling att visa, bara en ensam stapel
  // som ser ut som ett fel.
  if (points.length < 2) {
    return (
      <Card>
        <CardHeader
          title="Intäktsutveckling"
          description="Mätningen görs av schemajobbet, en gång per dygn. Grafen visas när det finns minst två månader att jämföra."
        />
        <p className="px-5 pb-5 text-[13px] leading-relaxed text-neutral-500">
          Historiken kan inte räknas fram i efterhand — en avslutad
          prenumeration lämnar inga spår om vad den var värd. Därför börjar
          grafen den dag mätningen först kördes.
        </p>
      </Card>
    );
  }

  const peak = Math.max(...points.map((point) => point.mrr), 1);
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const change = latest.mrr - previous.mrr;

  return (
    <Card>
      <CardHeader
        title="Intäktsutveckling"
        description="Månadsintäkt vid varje månads slut. Årsbetalningar omräknade till månad."
        action={
          <span
            className={`text-[13px] font-medium tabular-nums ${
              change > 0
                ? "text-emerald-600"
                : change < 0
                  ? "text-amber-700"
                  : "text-neutral-500"
            }`}
          >
            {change > 0 ? "+" : ""}
            {change.toLocaleString("sv-SE")} kr mot förra månaden
          </span>
        }
      />

      <div className="p-5">
        <div className="flex h-40 items-end gap-1.5">
          {points.map((point) => (
            <div
              key={point.month}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              {/* Beloppet syns vid hovring. Tolv siffror utskrivna samtidigt
                  gör grafen oläslig, och formen är det som ska läsas. */}
              <span className="mb-1 text-[10px] tabular-nums text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
                {point.mrr.toLocaleString("sv-SE")}
              </span>

              <div
                className="w-full rounded-t bg-blue-600/85 transition-colors group-hover:bg-blue-600"
                style={{
                  height: `${Math.max(2, (point.mrr / peak) * 100)}%`,
                }}
                title={`${point.label}: ${point.mrr.toLocaleString("sv-SE")} kr, ${point.payingCompanies} betalande`}
              />

              <span className="mt-1.5 truncate text-[10px] text-neutral-400">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
