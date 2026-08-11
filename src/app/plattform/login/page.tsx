import PlatformLoginForm from "@/components/admin/PlatformLoginForm";
import { Card } from "@/components/ui";

// Egen inloggning, skild från kundernas. Ett plattformskonto tillhör inget
// företag och ska aldrig kunna förväxlas med ett kundkonto.

export const dynamic = "force-dynamic";
export const metadata = { title: "Plattform — Tikkr" };

export default function PlatformLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Tikkr</h1>
          <p className="mt-1 text-sm text-neutral-500">Plattformsadministration</p>
        </div>

        <Card className="p-6">
          <PlatformLoginForm />
        </Card>

        <p className="mt-6 text-center text-xs leading-relaxed text-neutral-400">
          Konton skapas på servern med{" "}
          <code className="text-neutral-500">scripts/platform-user.sh</code>.
          <br />
          Är du kund loggar du in på /admin/login.
        </p>
      </div>
    </main>
  );
}
