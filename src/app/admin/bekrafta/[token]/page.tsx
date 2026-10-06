import Link from "next/link";
import { confirmEmail } from "@/lib/email-verification";
import AuthShell from "@/components/ui/AuthShell";

// Ligger utanför den skyddade adminmappen. Länken öppnas ofta i en annan
// webbläsare än den man är inloggad i, eller i telefonen, och den ska fungera
// där också.
//
// Länken bekräftas redan när sidan visas, utan en knapp att trycka på. En
// e-postklient som provöppnar länken för att leta skadlig kod bekräftar då
// adressen — vilket är rätt, eftersom mejlet bevisligen kom fram.

export const dynamic = "force-dynamic";
export const metadata = { title: "Bekräfta e-postadressen · Tikkr" };

export default async function ConfirmEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const email = await confirmEmail(token);

  if (!email) {
    return (
      <AuthShell
        title="Länken fungerar inte"
        subtitle="Länken har gått ut, redan använts eller gäller en annan adress."
        footer={
          <Link
            href="/admin"
            className="font-medium text-tick-deep hover:underline"
          >
            Till panelen
          </Link>
        }
      >
        <p className="text-[13px] leading-relaxed text-neutral-600">
          En ny länk skickas från remsan överst i panelen.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="E-postadressen är bekräftad"
      subtitle={email}
      footer={
        <Link href="/admin" className="font-medium text-tick-deep hover:underline">
          Till panelen
        </Link>
      }
    >
      <p className="text-[13px] leading-relaxed text-neutral-600">
        Återställning av lösenordet går till den här adressen.
      </p>
    </AuthShell>
  );
}
