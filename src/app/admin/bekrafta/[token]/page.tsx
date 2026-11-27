import Link from "next/link";
import { inspectEmailLink } from "@/lib/email-verification";
import AuthShell from "@/components/ui/AuthShell";
import { confirmEmailLink } from "./actions";
import ConfirmButton from "./ConfirmButton";

// Ligger utanför den skyddade adminmappen. Länken öppnas ofta i en annan
// webbläsare än den man är inloggad i, eller i telefonen, och den ska fungera
// där också.
//
// SIDAN BEKRÄFTAR INGENTING NÄR DEN VISAS, KNAPPEN GÖR DET (ändrat
// 2026-11-27). Till dess bekräftades adressen redan av besöket, och Microsofts
// Safe Links, som öppnar länkarna i ett mejl innan mottagaren ser det,
// förbrukade länken. Den som sedan klickade fick "Länken fungerar inte" fast
// adressen var bekräftad. Se linkState i email-verification.ts.

export const dynamic = "force-dynamic";
export const metadata = { title: "Bekräfta e-postadressen · Tikkr" };

const TO_PANEL = (
  <Link href="/admin" className="font-medium text-link hover:underline">
    Till panelen
  </Link>
);

export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await inspectEmailLink(token);

  if (state.kind === "ready") {
    return (
      <AuthShell
        title="Bekräfta e-postadressen"
        subtitle={state.email}
        footer={TO_PANEL}
      >
        <form action={confirmEmailLink.bind(null, token)}>
          <ConfirmButton />
        </form>
      </AuthShell>
    );
  }

  if (state.kind === "confirmed") {
    return (
      <AuthShell
        title="E-postadressen är bekräftad"
        subtitle={state.email}
        footer={TO_PANEL}
      >
        <p className="text-[13px] leading-relaxed text-neutral-600">
          Återställning av lösenordet går till den här adressen.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Länken fungerar inte"
      subtitle="Länken har gått ut eller gäller en annan adress."
      footer={TO_PANEL}
    >
      <p className="text-[13px] leading-relaxed text-neutral-600">
        En ny länk skickas från remsan överst i panelen.
      </p>
    </AuthShell>
  );
}
