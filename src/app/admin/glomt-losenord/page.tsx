import Link from "next/link";
import ForgotPasswordForm from "@/components/admin/ForgotPasswordForm";
import AuthShell from "@/components/ui/AuthShell";

// Ligger utanför admin-mappens layout, som kräver inloggning. Den som glömt
// sitt lösenord är per definition inte inloggad.

export const metadata = { title: "Glömt lösenord · Tikkr" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Glömt lösenord"
      subtitle="Vi skickar en länk för att välja ett nytt"
      footer={
        <>
          Kom du på det?{" "}
          <Link
            href="/admin/login"
            className="font-medium text-blue-600 hover:underline"
          >
            Tillbaka till inloggningen
          </Link>
        </>
      }
      note={
        <>
          Stämplingsskärmarna påverkas inte. De fortsätter registrera tid oavsett
          vem som kan logga in i panelen.
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
