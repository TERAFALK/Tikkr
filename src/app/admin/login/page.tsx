import Link from "next/link";
import LoginForm from "@/components/admin/LoginForm";
import TwoStepForm from "@/components/ui/TwoStepForm";
import AuthShell from "@/components/ui/AuthShell";
import { readTicket } from "@/lib/login-ticket";
import { adminTwoStep } from "@/lib/admin-mfa";
import { cancelLogin, confirmCode } from "./actions";

// Ligger utanför admin-mappens layout, eftersom den layouten kräver inloggning.
//
// Två lägen på samma adress. Utan lapp visas e-post och lösenord. Med en lapp
// (lösenordet är kontrollerat, se login-ticket.ts) visas steg två: QR-koden
// för den som inte satt upp appen än, annars fältet för koden.

export const dynamic = "force-dynamic";
export const metadata = { title: "Logga in · Tikkr" };

export default async function LoginPage() {
  const ticket = await readTicket("admin");
  const step = ticket ? await adminTwoStep(ticket.sub) : null;

  if (step) {
    return (
      <AuthShell
        title={step.mode === "enroll" ? "Tvåstegsinloggning" : "Ange koden"}
        subtitle={step.email}
      >
        <TwoStepForm
          action={confirmCode}
          cancel={cancelLogin}
          enrollment={step.mode === "enroll" ? step.enrollment : undefined}
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
          <Link
            href="/registrera"
            className="font-medium text-tick-deep hover:underline"
          >
            Skapa en arbetsyta
          </Link>
        </>
      }
      note={
        <>
          <Link
            href="/admin/glomt-losenord"
            className="font-medium text-tick-deep hover:underline"
          >
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
