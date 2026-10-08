import { requireAdmin } from "@/lib/admin-session";
import ConfirmButton from "@/components/admin/ConfirmButton";
import SaveForm from "@/components/admin/SaveForm";
import {
  Alert,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { changeEmail, changePassword, logoutEverywhere, saveOwnProfile } from "./actions";

/**
 * DET EGNA KONTOT: namn, telefon, e-postadress och lösenord.
 *
 * Låg under Inställningar / Användare, ovanför inbjudningarna och listan över
 * vilka som har åtkomst. Den sidan var därmed två sidor i en, och den som
 * skulle bjuda in en kollega möttes först av sitt eget lösenordsfält.
 *
 * Kontot är inte en inställning för arbetsytan. Det hör till den som är
 * inloggad, och nås från adressen längst ner i menyn, som i vilken annan
 * panel. Se AdminSidebar.
 */

/** Beskedet efter "Skicka igen" i remsan. Se resendVerification. */
const RESEND_MESSAGES: Record<string, { tone: "info" | "warning"; text: string }> = {
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

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ bekraftelse?: string }>;
}) {
  const session = await requireAdmin();
  const resend = RESEND_MESSAGES[(await searchParams).bekraftelse ?? ""];

  const isOwner = session.role === "OWNER";

  // Finns inte i supportläget, där ingen är inloggad som kunden.
  const me = session.support
    ? null
    : await session.db.adminUser.findFirst({
        where: { id: session.userId },
        select: { name: true, phone: true, email: true, emailVerifiedAt: true },
      });

  if (!me) {
    return (
      <>
        <PageHeader title="Ditt konto" />
        <Alert tone="info">I supportläget finns inget eget konto.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ditt konto" description={me.email} />

      <div className="max-w-2xl space-y-6">
        {resend && <Alert tone={resend.tone}>{resend.text}</Alert>}

        <Card>
          <CardHeader title="Uppgifter" />
          <SaveForm action={saveOwnProfile}>
            <Field label="Namn">
              <Input
                name="name"
                autoComplete="name"
                defaultValue={me.name ?? ""}
                required={isOwner}
              />
            </Field>
            <Field
              label="Telefonnummer"
              hint={isOwner ? "T.ex. 070-123 45 67" : "Valfritt. T.ex. 070-123 45 67"}
            >
              <Input
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={me.phone ? formatPhone(me.phone) : ""}
                required={isOwner}
              />
            </Field>
          </SaveForm>
        </Card>

        {/* En OBEKRÄFTAD adress går att rätta här, för stavfelet vid
            registreringen. En bekräftad är kontots identitet och byts via
            support. Se email-verification.ts. */}
        {!me.emailVerifiedAt && (
          <Card>
            <CardHeader
              title="E-postadress"
              description={`${me.email} är inte bekräftad.`}
            />
            <SaveForm action={changeEmail} submitLabel="Ändra adress">
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
            </SaveForm>
          </Card>
        )}

        <Card>
          <CardHeader title="Lösenord" />
          <SaveForm action={changePassword} submitLabel="Byt lösenord">
            <Field label="Nuvarande lösenord">
              <Input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Nytt lösenord" hint="Minst 10 tecken">
              <Input
                name="next"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </Field>
            <Field label="Upprepa det nya lösenordet">
              <Input
                name="repeat"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </Field>
          </SaveForm>

          <form
            action={logoutEverywhere}
            className="border-t border-neutral-100 p-5"
          >
            <ConfirmButton
              type="submit"
              tone="secondary"
              question="Logga ut på alla enheter? Du loggas också ut här."
            >
              Logga ut på alla enheter
            </ConfirmButton>
          </form>
        </Card>
      </div>
    </>
  );
}
