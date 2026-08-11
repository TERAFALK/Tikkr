/**
 * Logotypen som React-komponent istället för en bildfil.
 *
 * Skälet: den ska kunna byta storlek och färg efter var den sitter — mörk
 * fyrkant på ljus bakgrund i sidomenyn, större på inloggningssidan — utan att
 * vi underhåller flera filer som glider isär.
 *
 * Formen är en klocka med en visare i grönt. Grönt betyder pågående tid i hela
 * systemet, så märket säger vad produkten gör.
 */

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] bg-neutral-900"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.6}
        height={size * 0.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8" stroke="white" strokeWidth={1.75} />
        <path d="M12 7.5V12l3.2 2" stroke="#34d399" strokeWidth={2} />
      </svg>
    </span>
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-xl font-semibold tracking-tight text-neutral-900">
        Tikkr
      </span>
    </span>
  );
}
