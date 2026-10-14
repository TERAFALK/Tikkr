import type { ReactNode } from "react";
import Motif from "@/components/marketing/Motif";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { CONTACT, hasPhone } from "@/lib/contact";

/**
 * SKAL FÖR HJÄLPCENTRET.
 *
 * Säljsidans meny och fot, och samma mörka band överst. Hjälpcentret ska se ut
 * som en del av tikkr.se och inte som en bilaga från ett annat system, och det
 * är samma meny den som letar hjälp redan har sett.
 *
 * Bandet är lägre än säljsidans hero. Den som kommer hit har en fråga, och
 * svaret ska börja ovanför skärmkanten, även på en telefon.
 */
export default function HelpShell({
  eyebrow,
  title,
  lead,
  children,
  hero,
}: {
  /** Raden ovanför rubriken. Hjälpcenter, eller guidens område. */
  eyebrow: ReactNode;
  title: string;
  lead?: string;
  /** Det som står i bandet under rubriken, t.ex. sökfältet. */
  hero?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="marketing-page bg-white">
      <SiteHeader />

      <section className="relative overflow-hidden bg-neutral-900">
        <Motif tone="onDark" className="-right-64 -top-56 h-[40rem] w-[40rem]" />

        <div className="relative mx-auto max-w-3xl px-6 pb-12 pt-12 sm:pb-16 sm:pt-16">
          <p className="text-[11px] font-medium uppercase tracking-wider text-tick">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          {lead && (
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-400">
              {lead}
            </p>
          )}
          {hero && <div className="mt-8">{hero}</div>}
        </div>
      </section>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        {children}
        <ContactCard />
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * Vägen till en människa, sist på varje sida i hjälpcentret.
 *
 * Står där den som läst färdigt utan att få svar hamnar. Tomma värden i
 * contact.ts döljer sig själva, samma regel som ContactLine.
 */
function ContactCard() {
  return (
    <section
      id="kontakt"
      aria-labelledby="kontakt-rubrik"
      className="mt-16 rounded-xl border border-neutral-200 bg-neutral-50 p-6"
    >
      <h2
        id="kontakt-rubrik"
        className="text-base font-semibold tracking-tight text-neutral-900"
      >
        Kontakta support
      </h2>
      {/* Inga öppettider. Inga är bestämda, och en tid som inte hålls är
          sämre än ingen. */}
      <p className="mt-1 text-[13px] text-neutral-500">
        Uppge företagets namn.
      </p>

      <dl className="mt-5 grid gap-4 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">E-post</dt>
          <dd className="mt-0.5">
            <a
              href={`mailto:${CONTACT.email}`}
              className="font-medium text-tick-deep hover:underline"
            >
              {CONTACT.email}
            </a>
          </dd>
        </div>
        {hasPhone() && (
          <div>
            <dt className="text-neutral-500">Telefon</dt>
            <dd className="mt-0.5">
              <a
                href={`tel:${CONTACT.phoneHref}`}
                className="font-medium text-tick-deep hover:underline"
              >
                {CONTACT.phone}
              </a>
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-5 text-[13px] text-neutral-500">
        Driftstörningar visas överst på den här sidan och i panelen.
      </p>
    </section>
  );
}
