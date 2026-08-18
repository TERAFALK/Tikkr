import Link from "next/link";
import PlatformLoginForm from "@/components/admin/PlatformLoginForm";
import AuthShell from "@/components/ui/AuthShell";

// Egen inloggning, skild från kundernas. Ett plattformskonto tillhör inget
// kundföretag och kan därför inte användas för att stämpla eller läsa
// rapporter — det är en annan sorts konto, inte ett konto med mer behörighet.

export const dynamic = "force-dynamic";
export const metadata = { title: "Plattform — Tikkr" };

export default function PlatformLoginPage() {
  return (
    <AuthShell
      title="Plattform"
      subtitle="Administration av Tikkr"
      footer={
        <>
          Är du kund?{" "}
          <Link
            href="/admin/login"
            className="font-medium text-blue-600 hover:underline"
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
