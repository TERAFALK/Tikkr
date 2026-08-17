import Link from "next/link";
import { findPasswordReset, RESET_MINUTES } from "@/lib/password-reset";
import ResetPasswordForm from "@/components/admin/ResetPasswordForm";
import AuthShell from "@/components/ui/AuthShell";

// Ligger utanför den skyddade adminmappen — den som öppnar länken kommer per
// definition inte in med lösenord.

export const dynamic = "force-dynamic";
export const metadata = { title: "Nytt lösenord — Tikkr" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await findPasswordReset(token);

  if (!reset) {
    return (
      <AuthShell
        title="Länken fungerar inte"
        subtitle="Den har gått ut, redan använts eller ersatts av en nyare."
        footer={
          <Link
            href="/admin/glomt-losenord"
            className="font-medium text-blue-600 hover:underline"
          >
            Begär en ny länk
          </Link>
        }
      >
        <p className="text-[13px] leading-relaxed text-neutral-600">
          En återställningslänk gäller i {RESET_MINUTES} minuter och kan bara
          användas en gång. Den korta giltighetstiden är avsiktlig: en länk som
          ligger kvar i en inkorg är en väg in i kontot för den som kommer åt
          inkorgen senare.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Välj ett nytt lösenord"
      subtitle="Du loggas in direkt när det är sparat."
      note="Alla enheter som är inloggade på kontot loggas ut när lösenordet ändras."
    >
      <ResetPasswordForm token={token} email={reset.email} />
    </AuthShell>
  );
}
