import Link from "next/link";
import SignupForm from "@/components/admin/SignupForm";
import AuthShell from "@/components/ui/AuthShell";

export const metadata = { title: "Kom igång · Tikkr" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Skapa en arbetsyta"
      subtitle="30 dagars provperiod. Inget betalkort krävs."
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
      note={
        // Villkoren accepteras här, alltså ska de gå att läsa här. En länk
        // efteråt är för sent.
        <>
          Genom att skapa en arbetsyta godkänner du{" "}
          <Link href="/villkor" className="text-blue-600 hover:underline">
            användarvillkoren
          </Link>
          ,{" "}
          <Link
            href="/integritetspolicy"
            className="text-blue-600 hover:underline"
          >
            integritetspolicyn
          </Link>{" "}
          och{" "}
          <Link
            href="/personuppgiftsbitradesavtal"
            className="text-blue-600 hover:underline"
          >
            personuppgiftsbiträdesavtalet
          </Link>
          .
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
