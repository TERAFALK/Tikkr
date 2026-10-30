import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminEvenIfLocked } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import ActionDialog from "@/components/ui/ActionDialog";
import AuthShell from "@/components/ui/AuthShell";
import { Alert, Field, Input } from "@/components/ui";
import type { SaveState } from "@/lib/save-state";
import { changeEmail, resendVerification } from "./actions";
import ResendButton from "./ResendButton";

/**
 * SPÄRREN: ADRESSEN MÅSTE BEKRÄFTAS INNAN PANELEN ÖPPNAS (2026-10-11).
 *
 * Gäller den som precis registrerat en arbetsyta. Panelens layout skickar hit
 * så länge adressen är obekräftad, se admin/(panel)/layout.tsx.
 *
 * LIGGER UTANFÖR `(panel)` MED FLIT. En spärrsida inuti den layout som skickar
 * hit hade skickat vidare till sig själv i all oändlighet. Den ligger därför
 * bredvid inloggningen, och bär samma skal som den: det här är sista steget i
 * registreringen, inte en sida i panelen.
 *
 * VARFÖR SPÄRREN FINNS. Tvåstegsinloggningen är flyttad till nästa inloggning
 * (§ 4 punkt 5 i CLAUDE.md), och då är adressen det enda som binder kontot
 * till en människa vi kan nå. En arbetsyta vars ägare skrivit fel adress går
 * annars varken att återställa lösenordet på eller att nå med ett besked om
 * driften — och felet upptäcks den dag det är som mest i vägen.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Bekräfta e-postadressen · Tikkr" };

/** Beskedet efter "Skicka igen". Se resendVerification. */
const OUTCOME: Record<string, { tone: "info" | "warning"; text: string }> = {
  sent: { tone: "info", text: "En ny länk är skickad." },
  cooldown: {
    tone: "info",
    text: "En länk skickades nyss. Vänta ett par minuter innan du begär en till.",
  },
  failed: {
    tone: "warning",
    text: "Länken kunde inte skickas. Försök igen senare, eller kontakta support@tikkr.se.",
  },
};

export default async function ConfirmAddressPage({
  searchParams,
}: {
  searchParams: Promise<{ utskick?: string }>;
}) {
  const session = await requireAdminEvenIfLocked();

  // Supportläget har inget eget konto och ska aldrig hamna här. Det skriver
  // dessutom ingenting, så sidans båda åtgärder vore ändå avvisade.
  if (session.support) redirect("/admin");

  const me = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerifiedAt: true },
  });

  // Bekräftad under tiden, till exempel i en annan webbläsare eller i
  // telefonen. Då är spärren förbi och sidan har inget att säga.
  if (!me || me.emailVerifiedAt) redirect("/admin");

  const outcome = OUTCOME[(await searchParams).utskick ?? ""];

  return (
    <AuthShell
      title="Bekräfta din e-postadress"
      subtitle={me.email}
      footer={
        <>
          Bekräftat redan? <Link href="/admin">Öppna panelen</Link>
        </>
      }
      note="Länken gäller i sju dagar och kan bara användas en gång."
    >
      <div className="space-y-4">
        {outcome && <Alert tone={outcome.tone}>{outcome.text}</Alert>}

        <p className="text-[13px] leading-relaxed text-neutral-600">
          Arbetsytan är skapad. Öppna länken i mejlet från Tikkr, så är du
          igång. Ligger det inte i inkorgen kan det ha hamnat i skräpposten.
        </p>

        <form action={resendVerification}>
          <ResendButton />
        </form>

        {/* VÄGEN UT UR ETT STAVFEL. Utan den här är en felskriven adress
            detsamma som en arbetsyta ingen kommer in i. Lösenordet krävs,
            eftersom adressen är kontots identitet. */}
        <div className="border-t border-neutral-200 pt-4">
          <p className="mb-3 text-[13px] leading-relaxed text-neutral-600">
            Skrev du fel adress?
          </p>

          <ActionDialog<SaveState>
            trigger="Ändra adress"
            title="Ändra e-postadress"
            description="En ny länk skickas till den nya adressen."
            action={changeEmail}
            initial={{}}
            submitLabel="Ändra adress"
          >
            <Field label="Ny e-postadress">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Lösenord">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
          </ActionDialog>
        </div>
      </div>
    </AuthShell>
  );
}
