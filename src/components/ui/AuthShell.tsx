import type { ReactNode } from "react";
import { LogoMark } from "./Logo";

/**
 * Gemensamt skal för alla sidor där någon loggar in eller skapar ett konto.
 *
 * Fyra sidor delar det: kundinloggning, registrering, inbjudan och
 * plattformsinloggning. Att de ser likadana ut är inte bara ordning — den som
 * öppnar en inbjudningslänk ska känna igen sig från inloggningssidan och förstå
 * att det är samma system.
 *
 * `tone` skiljer plattformsinloggningen visuellt från kundernas. Det är den
 * enda platsen i produkten där någon administrerar alla kunder, och den ska
 * inte gå att förväxla med en vanlig inloggning.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  note,
  tone = "customer",
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  note?: ReactNode;
  tone?: "customer" | "platform";
}) {
  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-center px-4 py-12 ${
        tone === "platform" ? "bg-neutral-900" : "bg-neutral-100"
      }`}
    >
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={44} />

          <h1
            className={`mt-5 text-[22px] font-semibold tracking-tight ${
              tone === "platform" ? "text-white" : "text-neutral-900"
            }`}
          >
            {title}
          </h1>

          {subtitle && (
            <p
              className={`mt-1.5 text-[13px] leading-relaxed ${
                tone === "platform" ? "text-neutral-400" : "text-neutral-500"
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          {children}
        </div>

        {footer && (
          <p
            className={`mt-5 text-center text-[13px] ${
              tone === "platform" ? "text-neutral-400" : "text-neutral-500"
            }`}
          >
            {footer}
          </p>
        )}

        {note && (
          <p
            className={`mt-4 text-center text-xs leading-relaxed ${
              tone === "platform" ? "text-neutral-500" : "text-neutral-400"
            }`}
          >
            {note}
          </p>
        )}
      </div>
    </main>
  );
}
