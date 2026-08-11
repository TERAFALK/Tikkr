import Link from "next/link";
import SignupForm from "@/components/admin/SignupForm";
import { Card } from "@/components/ui";

export const metadata = { title: "Kom igång — Tikkr" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Tikkr</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Skapa en arbetsyta för ditt företag
          </p>
        </div>

        <Card className="p-6">
          <SignupForm />
        </Card>

        <p className="mt-6 text-center text-[13px] text-neutral-500">
          Har du redan ett konto?{" "}
          <Link href="/admin/login" className="font-medium text-blue-600">
            Logga in
          </Link>
        </p>
      </div>
    </main>
  );
}
