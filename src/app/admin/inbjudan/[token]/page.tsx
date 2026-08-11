import Link from "next/link";
import { findInvite } from "@/lib/admin-users";
import AcceptInviteForm from "@/components/admin/AcceptInviteForm";
import { Card } from "@/components/ui";

// Ligger utanför den skyddade adminmappen — den som öppnar länken har per
// definition inget konto än.

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbjudan — Tikkr" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await findInvite(token);

  if (!invite) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
        <Card className="max-w-sm p-8 text-center">
          <h1 className="text-xl font-semibold text-neutral-900">
            Länken fungerar inte
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            Inbjudan har gått ut, redan använts eller återkallats. Be den som
            bjöd in dig om en ny länk.
          </p>
          <Link
            href="/admin/login"
            className="mt-5 inline-block text-[13px] font-medium text-blue-600"
          >
            Till inloggningen
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Tikkr</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Du har bjudits in som{" "}
            {invite.role === "OWNER" ? "ägare" : "administratör"} hos{" "}
            <strong className="text-neutral-700">{invite.companyName}</strong>
          </p>
        </div>

        <Card className="p-6">
          <AcceptInviteForm token={token} email={invite.email} />
        </Card>

        <p className="mt-6 text-center text-xs text-neutral-400">
          Länken kan bara användas en gång.
        </p>
      </div>
    </main>
  );
}
