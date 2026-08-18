import type { ReactNode } from "react";
import { LogoMark } from "./Logo";

/**
 * Gemensamt skal för alla sidor där någon loggar in eller skapar ett konto.
 *
 * Fem sidor delar det: kundinloggning, registrering, inbjudan, återställning
 * av lösenord och plattformsinloggning. Att de ser likadana ut är inte bara
 * ordning — den som öppnar en inbjudningslänk ska känna igen sig från
 * inloggningssidan och förstå att det är samma system.
 *
 * Tidigare hade plattformsinloggningen en mörk variant, för att inte gå att
 * förväxla med kundernas. Den skillnaden är borttagen: sidan såg ut att höra
 * till en annan produkt, och skiljelinjen framgår ändå av rubriken.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  note,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={44} />

          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-neutral-900">
            {title}
          </h1>

          {subtitle && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
              {subtitle}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          {children}
        </div>

        {footer && (
          <p className="mt-5 text-center text-[13px] text-neutral-500">
            {footer}
          </p>
        )}

        {note && (
          <p className="mt-4 text-center text-xs leading-relaxed text-neutral-400">
            {note}
          </p>
        )}
      </div>
    </main>
  );
}
