import Link from "next/link";
import LoginForm from "@/components/admin/LoginForm";
import AuthShell from "@/components/ui/AuthShell";

// Ligger utanför admin-mappens layout, eftersom den layouten kräver inloggning.

export const metadata = { title: "Logga in — Tikkr" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Logga in"
      subtitle="Adminpanel för tidregistrering"
      footer={
        <>
          Nytt företag?{" "}
          <Link
            href="/registrera"
            className="font-medium text-blue-600 hover:underline"
          >
            Skapa en arbetsyta
          </Link>
        </>
      }
      note={
        <>
          Vid glömt lösenord, kontakta support@tikkr.se. Återställning via e-post införs senare.
          <br />
          Stämplingsskärmar loggar inte in här. De kopplas via en egen länk från adminpanelen.
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
