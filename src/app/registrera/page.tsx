import Link from "next/link";
import SignupForm from "@/components/admin/SignupForm";
import AuthShell from "@/components/ui/AuthShell";

export const metadata = { title: "Kom igång — Tikkr" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Skapa en arbetsyta"
      subtitle="30 dagar utan kostnad. Inget kort behövs."
      footer={
        <>
          Har du redan ett konto?{" "}
          <Link
            href="/admin/login"
            className="font-medium text-blue-600 hover:underline"
          >
            Logga in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
