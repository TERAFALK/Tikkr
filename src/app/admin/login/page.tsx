import Link from "next/link";
import LoginForm from "@/components/admin/LoginForm";
import AuthShell from "@/components/ui/AuthShell";

// Ligger utanför admin-mappens layout, eftersom den layouten kräver inloggning.

export const metadata = { title: "Logga in — Tikkr" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Logga in"
      subtitle="Adminpanelen för ditt företags tidregistrering"
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
          Glömt lösenordet? Hör av dig till oss — återställning via mejl är på väg.
          <br />
          Stämplingsskärmar loggar inte in här, de kopplas med en egen länk.
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
