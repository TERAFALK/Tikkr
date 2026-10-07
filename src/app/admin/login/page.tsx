import Link from "next/link";
import LoginForm from "@/components/admin/LoginForm";
import TwoStepForm from "@/components/ui/TwoStepForm";
import AuthShell from "@/components/ui/AuthShell";
import { Alert } from "@/components/ui";
import { readTicket } from "@/lib/login-ticket";
import {
  adminTwoStep,
  EMAIL_CODE_MINUTES,
  loginAlternatives,
  type EmailCodeOutcome,
} from "@/lib/admin-mfa";
import { TRUSTED_DEVICE_DAYS } from "@/lib/trusted-device";
import { CONTACT } from "@/lib/contact";
import { cancelLogin, confirmCode, sendEmailCode } from "./actions";

// Ligger utanför admin-mappens layout, eftersom den layouten kräver inloggning.
//
// Flera lägen på samma adress. Utan lapp visas e-post och lösenord. Med en
// lapp (lösenordet är kontrollerat, se login-ticket.ts) visas steg två:
//
//   QR-koden                  appen är inte uppsatt än
//   koden från appen          standard
//   ?alternativ=1             inloggningsalternativen, som Microsofts
//                             "Logga in på ett annat sätt"
//   ?metod=epost              koden som skickats via e-post
//
// Appen sätts alltid upp först. E-post är ett alternativ för dagen telefonen
// ligger hemma, inte en väg runt appen, se loginAlternatives i admin-mfa.ts.

export const dynamic = "force-dynamic";
export const metadata = { title: "Logga in · Tikkr" };

const OUTCOME: Record<
  Exclude<EmailCodeOutcome, "unavailable">,
  { tone: "info" | "warning" | "error"; text: (to: string) => string }
> = {
  sent: {
    tone: "info",
    text: (to) =>
      `En kod har skickats till ${to}. Den gäller i ${EMAIL_CODE_MINUTES} minuter.`,
  },
  cooldown: {
    tone: "warning",
    text: () => "En kod skickades nyss. Vänta en minut innan du begär en ny.",
  },
  failed: {
    tone: "error",
    text: () => "Mejlet gick inte att skicka. Försök igen eller använd appen.",
  },
};

const linkClass = "font-medium text-tick-deep hover:underline";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ alternativ?: string; metod?: string; utskick?: string }>;
}) {
  const ticket = await readTicket("admin");
  const step = ticket ? await adminTwoStep(ticket.sub) : null;

  if (ticket && step?.mode === "enroll") {
    return (
      <AuthShell title="Tvåstegsinloggning" subtitle={step.email}>
        <TwoStepForm
          action={confirmCode}
          cancel={cancelLogin}
          enrollment={step.enrollment}
          rememberDays={TRUSTED_DEVICE_DAYS}
        />
      </AuthShell>
    );
  }

  if (ticket && step) {
    const params = await searchParams;
    const afterReset = ticket.afterReset === true;
    const { email: maskedEmail } = await loginAlternatives(ticket.sub, afterReset);

    const alternativesLink = (
      <p className="text-center text-[13px]">
        <Link href="/admin/login?alternativ=1" className={linkClass}>
          Inloggningsalternativ
        </Link>
      </p>
    );

    if (params.metod === "epost" && maskedEmail) {
      const outcome = OUTCOME[params.utskick as keyof typeof OUTCOME];

      return (
        <AuthShell title="Ange koden" subtitle={step.email}>
          <TwoStepForm
            action={confirmCode}
            cancel={cancelLogin}
            method="email"
            rememberDays={TRUSTED_DEVICE_DAYS}
            intro={
              <Alert tone={outcome?.tone ?? "info"}>
                {outcome
                  ? outcome.text(maskedEmail)
                  : `Koden skickas till ${maskedEmail}.`}
              </Alert>
            }
            alternatives={
              <div className="space-y-2">
                <form action={sendEmailCode} className="text-center">
                  <button type="submit" className={`text-[13px] ${linkClass}`}>
                    Skicka en ny kod
                  </button>
                </form>
                {alternativesLink}
              </div>
            }
          />
        </AuthShell>
      );
    }

    if (params.alternativ === "1" || params.metod === "epost") {
      return (
        <AuthShell title="Inloggningsalternativ" subtitle={step.email}>
          <div className="space-y-3">
            <Link
              href="/admin/login"
              className="block rounded-md border border-neutral-200 px-4 py-3 text-[13px] font-medium text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50"
            >
              Kod från autentiseringsappen
            </Link>

            {maskedEmail ? (
              <form action={sendEmailCode}>
                <button
                  type="submit"
                  className="block w-full rounded-md border border-neutral-200 px-4 py-3 text-left text-[13px] font-medium text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50"
                >
                  Kod via e-post till {maskedEmail}
                </button>
              </form>
            ) : (
              <Alert tone="info">
                {afterReset
                  ? "Efter ett nytt lösenord krävs koden från appen."
                  : "Kod via e-post går att välja när e-postadressen är bekräftad."}
              </Alert>
            )}

            <p className="pt-1 text-[13px] leading-relaxed text-neutral-500">
              Tappad telefon: en ägare nollställer tvåstegsinloggningen under
              Användare. Ägare kontaktar{" "}
              <a href={`mailto:${CONTACT.email}`} className={linkClass}>
                {CONTACT.email}
              </a>
              .
            </p>

            <form action={cancelLogin} className="text-center">
              <button
                type="submit"
                className="text-[13px] font-medium text-neutral-500 hover:underline"
              >
                Avbryt
              </button>
            </form>
          </div>
        </AuthShell>
      );
    }

    return (
      <AuthShell title="Ange koden" subtitle={step.email}>
        <TwoStepForm
          action={confirmCode}
          cancel={cancelLogin}
          rememberDays={TRUSTED_DEVICE_DAYS}
          alternatives={alternativesLink}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Logga in"
      subtitle="Adminpanel för tidregistrering"
      footer={
        <>
          Nytt företag?{" "}
          <Link href="/registrera" className={linkClass}>
            Skapa en arbetsyta
          </Link>
        </>
      }
      note={
        <>
          <Link href="/admin/glomt-losenord" className={linkClass}>
            Glömt lösenordet?
          </Link>
          <br />
          Stämplingsskärmar loggar inte in här. De kopplas med en kod från
          adminpanelen.
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
