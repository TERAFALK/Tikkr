import ImageWithFallback from "@/components/ui/ImageWithFallback";

/**
 * PORTRÄTT PÅ EN ANSTÄLLD.
 *
 * Faller tillbaka på initialerna när inget foto finns. Det är avsiktligt inte
 * en tom ruta eller en generisk siluett: initialer skiljer personer åt, och
 * ett rutnät där hälften har foto och hälften en identisk gubbe ser trasigt
 * ut.
 *
 * Bilden hämtas alltid via adressen och aldrig som inbäddad data. Ett rutnät
 * med tjugo namn skulle annars ladda tjugo bilder i samma HTML-svar, varje
 * gång sidan uppdateras.
 */

/**
 * Färg ur namnet, så att samma person alltid får samma ton.
 *
 * Tonerna ligger inom paletten: Fjord, grönt och Lav i två styrkor vardera,
 * plus gult. Tre av dem var tidigare violett, rosa och cyan — färger som inte
 * finns i varumärket, och som syntes desto mer eftersom resten av gränssnittet
 * är Fjord och Snö.
 *
 * Sex toner ur två kulörer betyder att ett par av dem skiljer sig i styrka och
 * inte i färg. Det räcker: uppgiften är att SAMMA person alltid får samma ton
 * så att ögat hittar rätt knapp på formen, inte att sex personer ska gå att
 * skilja åt på färgen ensam. Namnet står bredvid.
 */
const TONES = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-blue-200 text-blue-800",
  "bg-emerald-200 text-emerald-800",
  "bg-neutral-200 text-neutral-700",
];

/**
 * Tonen ur namnet. Exporterad eftersom säljsidans produktbilder ritar samma
 * kort: en kopia där hade varit två ställen som ska säga samma sak, och de
 * hinner alltid sluta göra det.
 */
export function toneFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return TONES[sum % TONES.length];
}

/** Förnamnets och efternamnets första bokstav. Ett namn ger en bokstav. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";

  return (first + last).toUpperCase();
}

export default function EmployeeAvatar({
  employeeId,
  name,
  hasPhoto,
  size = 44,
  /** Ljus ram, för mörka kort där personen är instämplad. */
  onDark = false,
  className = "",
}: {
  employeeId: string;
  name: string;
  hasPhoto: boolean;
  size?: number;
  onDark?: boolean;
  className?: string;
}) {
  const style = { width: size, height: size };

  const initials = (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        onDark ? "bg-white/20 text-white" : toneFor(name)
      } ${className}`}
    >
      {initialsOf(name)}
    </span>
  );

  if (!hasPhoto) return initials;

  // Initialerna är också reserven när fotot inte går att hämta, till exempel
  // på en skärm utan nät som inte hunnit spara det.
  return (
    <ImageWithFallback
      src={`/api/anstallda/${employeeId}/foto`}
      style={style}
      className={`shrink-0 rounded-full object-cover ${
        onDark ? "ring-2 ring-white/40" : "ring-1 ring-neutral-200"
      } ${className}`}
      fallback={initials}
    />
  );
}
