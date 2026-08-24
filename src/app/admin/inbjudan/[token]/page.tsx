import Link from "next/link";
import { findInvite } from "@/lib/admin-users";
import AcceptInviteForm from "@/components/admin/AcceptInviteForm";
import AuthShell from "@/components/ui/AuthShell";

// Ligger utanför den skyddade adminmappen — den som öppnar länken har per
// definition inget konto än.

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbjudan · Tikkr" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await findInvite(token);

  if (!invite) {
    return (
      <AuthShell
        title="Länken fungerar inte"
        subtitle="Inbjudan har gått ut, redan använts eller återkallats."
        footer={
          <Link
            href="/admin/login"
            className="font-medium text-blue-600 hover:underline"
          >
            Till inloggningen
          </Link>
        }
      >
        <p className="text-[13px] leading-relaxed text-neutral-600">
          Be den som bjöd in dig att skapa en ny länk. En inbjudan gäller i sju
          dagar och kan bara användas en gång, vilket är skälet till att den slutat
          fungera, inte för att något är trasigt.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Välkommen till ${invite.companyName}`}
      subtitle={
        <>
          Du har bjudits in som{" "}
          <strong className="font-medium text-neutral-700">
            {invite.role === "OWNER" ? "ägare" : "administratör"}
          </strong>
          . Välj ett lösenord så är du igång.
        </>
      }
      note="Länken kan bara användas en gång."
    >
      <AcceptInviteForm token={token} email={invite.email} />
    </AuthShell>
  );
}
