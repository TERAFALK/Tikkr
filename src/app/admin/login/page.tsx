import LoginForm from "@/components/admin/LoginForm";
import Link from "next/link";
import { Card } from "@/components/ui";

// Ligger utanför admin-mappens layout, eftersom den layouten kräver inloggning.

export const metadata = { title: "Logga in — Tikkr" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Tikkr</h1>
          <p className="mt-1 text-sm text-neutral-500">Adminpanel</p>
        </div>

        <Card className="p-6">
          <LoginForm />
        </Card>

        <p className="mt-6 text-center text-[13px] text-neutral-500">
          Nytt företag?{" "}
          <Link href="/registrera" className="font-medium text-blue-600">
            Skapa en arbetsyta
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-neutral-400">
          Stämplingsskärmar loggar inte in här — de kopplas med en egen länk.
        </p>
      </div>
    </main>
  );
}
