import type { ReactNode } from "react";
import Link from "next/link";
import AuthBackdrop from "./AuthBackdrop";
import { Wordmark } from "./Logo";

/**
 * Gemensamt skal för alla sidor där någon loggar in eller skapar ett konto.
 *
 * Sju sidor delar det: kundinloggning, registrering, inbjudan, bekräftelse av
 * adress, glömt lösenord, återställning och plattformsinloggning. Att de ser
 * likadana ut är inte bara ordning — den som öppnar en inbjudningslänk ska
 * känna igen sig från inloggningssidan och förstå att det är samma system.
 *
 * Tidigare hade plattformsinloggningen en mörk variant, för att inte gå att
 * förväxla med kundernas. Den skillnaden är borttagen: sidan såg ut att höra
 * till en annan produkt, och skiljelinjen framgår ändå av rubriken.
 *
 * YTAN ÄR MÖRK SEDAN 2026-10-11 (issue #16). Den var ljusgrå och platt, och
 * den som kom från säljsidans hero rakt in i registreringen bytte produkt mitt
 * i ett steg. Nu ligger rutan på samma yta som säljsidan: Fjord, ljuset som
 * driver, ritningsrutnätet och två produktbilder som svävar i kanterna. Se
 * `AuthBackdrop`.
 *
 * RUTAN SJÄLV ÄR VIT OCH ORÖRD. Det är där man skriver, och ett fält på en
 * mörk yta med ett ljus bakom är ett fält man inte ser kanten på. Guiden säger
 * att Fjord och Snö bär ytorna; här bär Fjord sidan och Snö rutan.
 *
 * ORDMÄRKET OCH INTE APP-IKONEN. Ikonen är en Fjord-ruta, och en Fjord-ruta på
 * en Fjord-yta är ingen logotyp. Det vågräta märket i omvänd färgsättning är
 * dessutom detsamma som står i säljsidans meny, vilket är hela poängen med
 * sidan.
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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-neutral-900 px-4 py-12">
      <AuthBackdrop />

      <div className="relative w-full max-w-[380px]">
        <div className="animate-rise mb-7 flex flex-col items-center text-center">
          {/* Märket leder till startsidan. Den som hamnat här av misstag, eller
              vill läsa om produkten innan hen registrerar sig, har annars
              ingen väg ut som inte är webbläsarens bakåtknapp. */}
          <Link href="/" aria-label="Tikkr" className="rounded-md">
            <Wordmark size={30} tone="reversed" />
          </Link>

          <h1 className="mt-6 text-[22px] font-semibold tracking-tight text-white">
            {title}
          </h1>

          {subtitle && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
              {subtitle}
            </p>
          )}
        </div>

        {/* Skuggan är produktbildernas, se `.plate` i globals.css: ett tätt
            lager vid kanten som ger rutan vikt, och ett stort diffust som ger
            rummet omkring den. Det är skillnaden mellan ett kort klistrat på en
            färg och ett föremål som ligger framför en yta. */}
        <div
          className="animate-rise-soft plate plate-dark rounded-xl bg-white p-6"
          style={{ animationDelay: "80ms" }}
        >
          {children}
        </div>

        {/* LÄNKARNA UTANFÖR RUTAN FÅR SIN FÄRG HÄR, och inte på varje sida.
            Guiden har två accentgröna: Tick Deep för ljus yta och Tick för
            mörk. Sidorna skrev Tick Deep, vilket var rätt så länge skalet var
            ljusgrått och är oläsligt mot Fjord.

            En regel på den omslutande rutan i stället för en ändring i sju
            filer: regeln gäller då även nästa sida någon lägger till, och den
            som skriver den behöver inte känna till att foten ligger på en mörk
            yta. Väljaren träffar länken och vinner därför över klassen som
            står på den. */}
        {footer && (
          <p
            className="animate-rise mt-5 text-center text-[13px] text-neutral-400 [&_a]:font-medium [&_a]:text-tick [&_a]:hover:underline [&_button]:font-medium [&_button]:text-tick [&_button]:hover:underline"
            style={{ animationDelay: "140ms" }}
          >
            {footer}
          </p>
        )}

        {note && (
          <p
            className="animate-rise mt-4 text-center text-xs leading-relaxed text-neutral-400 [&_a]:font-medium [&_a]:text-tick [&_a]:hover:underline [&_button]:font-medium [&_button]:text-tick [&_button]:hover:underline"
            style={{ animationDelay: "180ms" }}
          >
            {note}
          </p>
        )}
      </div>
    </main>
  );
}
