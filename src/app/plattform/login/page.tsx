import Link from "next/link";
import PlatformLoginForm from "@/components/admin/PlatformLoginForm";
import TwoStepForm from "@/components/ui/TwoStepForm";
import AuthShell from "@/components/ui/AuthShell";
import { readTicket } from "@/lib/login-ticket";
import { platformTwoStep } from "@/lib/platform-auth";
import { platformCancelLogin, platformConfirmCode } from "./actions";

// Egen inloggning, skild från kundernas. Ett plattformskonto tillhör inget
// kundföretag och kan därför inte användas för att stämpla eller läsa
// rapporter — det är en annan sorts konto, inte ett konto med mer behörighet.
//
// Två lägen på samma adress, som kundernas inloggning: adress och lösenord,
// sedan QR-koden eller koden. Se login-ticket.ts.

export const dynamic = "force-dynamic";
export const metadata = { title: "Plattform · Tikkr" };

export default async function PlatformLoginPage() {
  const ticket = await readTicket("platform");
  const step = ticket ? await platformTwoStep(ticket.sub) : null;

  if (ticket && step) {
    return (
      <AuthShell
        title={step.mode === "enroll" ? "Tvåstegsinloggning" : "Ange koden"}
        subtitle={ticket.sub}
      >
        <TwoStepForm
          action={platformConfirmCode}
          cancel={platformCancelLogin}
          enrollment={step.mode === "enroll" ? step.enrollment : undefined}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Plattform"
      subtitle="Administration av Tikkr"
      footer={
        <>
          Är du kund?{" "}
          <Link
            href="/admin/login"
            className="font-medium text-tick-deep hover:underline"
          >
            Logga in här
          </Link>
        </>
      }
    >
      <PlatformLoginForm />
    </AuthShell>
  );
}
