import PlatformLoginForm from "@/components/admin/PlatformLoginForm";
import AuthShell from "@/components/ui/AuthShell";

// Egen inloggning, skild från kundernas. Ett plattformskonto tillhör inget
// företag och ska aldrig kunna förväxlas med ett kundkonto — därför den mörka
// bakgrunden. Man ska se på skärmen vilken sida man står på.

export const dynamic = "force-dynamic";
export const metadata = { title: "Plattform — Tikkr" };

export default function PlatformLoginPage() {
  return (
    <AuthShell
      tone="platform"
      title="Plattformsadministration"
      subtitle="Översikt över samtliga kundföretag"
      note={
        <>
          Konton skapas på servern med scripts/platform-user.sh.
          <br />
          Kundinloggning sker på /admin/login.
        </>
      }
    >
      <PlatformLoginForm />
    </AuthShell>
  );
}
