import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin-session";
import ConfirmButton from "@/components/admin/ConfirmButton";
import SaveForm from "@/components/admin/SaveForm";
import ActionDialog from "@/components/ui/ActionDialog";
import { initialsOf } from "@/components/ui/EmployeeAvatar";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { fullName } from "@/lib/person-name";
import type { SaveState } from "@/lib/save-state";
import TwoStepEnrollment from "@/components/ui/TwoStepEnrollment";
import { adminTwoStep } from "@/lib/admin-mfa";
import {
  changeEmail,
  changePassword,
  enableTwoStep,
  logoutEverywhere,
  saveOwnProfile,
} from "./actions";

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
 *
 * UPPSTÄLLNINGEN (ändrat 2026-10-11). Var fyra formulär under varandra, och
 * sidan såg ut som ett ifyllnadsblad. Nu står vem man är överst, uppgifterna
 * och säkerheten bredvid varandra under, och det man gör sällan, att byta
 * lösenord eller rätta adressen, öppnas i en ruta i stället för att alltid
 * stå utfällt.
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
  searchParams: Promise<{ bekraftelse?: string; tvasteg?: string }>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const resend = RESEND_MESSAGES[params.bekraftelse ?? ""];
  const openTwoStep = params.tvasteg === "1";

  const isOwner = session.role === "OWNER";

  // Finns inte i supportläget, där ingen är inloggad som kunden.
  const me = session.support
    ? null
    : await session.db.adminUser.findFirst({
        where: { id: session.userId },
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          emailVerifiedAt: true,
          passwordChangedAt: true,
          totpEnabledAt: true,
          createdAt: true,
        },
      });


  // Namnet slås ihop ur de två fälten och lagras ingenstans, se
  // person-name.ts. Saknas det står adressen i stället: ett konto utan namn
  // ska synas som ett konto, inte som ett hål.
  const name = me ? fullName(me) : null;

  /**
   * NYCKELN TILL APPEN, för den som inte kopplat någon.
   *
   * `adminTwoStep` SKRIVER när ingen nyckel finns: den skapar en och sparar
   * den krypterad. En läsning som skriver går inte i supportläget, där allt
   * skrivande avvisas (§ 4 punkt 5), och därför ligger `session.support`
   * först i villkoret. Samma konstruktion som inloggningssidan har, och av
   * samma skäl: QR-koden måste finnas på sidan innan någon trycker.
   *
   * Nyckeln blir inte giltig av att visas. Först när en kod ur appen godkänts
   * räknas appen som kopplad, se enableTwoStep.
   */
  const twoStep =
    !session.support && me && !me.totpEnabledAt
      ? await adminTwoStep(session.userId)
      : null;

  const enrollment = twoStep?.mode === "enroll" ? twoStep.enrollment : undefined;

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
      <PageHeader title="Ditt konto" />

      <div className="max-w-5xl space-y-6">
        {resend && <Alert tone={resend.tone}>{resend.text}</Alert>}

        <Card>
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-fjord text-lg font-semibold text-white"
            >
              {initialsOf(name ?? me.email)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-neutral-900">
                {name ?? me.email}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
                {name && <span className="truncate">{me.email}</span>}
                <Badge>{isOwner ? "Ägare" : "Administratör"}</Badge>
                {me.emailVerifiedAt ? (
                  <Badge tone="active">Bekräftad adress</Badge>
                ) : (
                  <Badge tone="warning">Adressen är inte bekräftad</Badge>
                )}
              </div>
            </div>

            {/* En OBEKRÄFTAD adress går att rätta här, för stavfelet vid
                registreringen. En bekräftad är kontots identitet och byts via
                support. Se email-verification.ts. */}
            {!me.emailVerifiedAt && (
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
            )}
          </div>
        </Card>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Uppgifter" />
            <SaveForm action={saveOwnProfile} className="space-y-4 p-5">
              {/* FÖRNAMN OCH EFTERNAMN I VARSITT FÄLT (2026-10-11, issue
                  #16). Var ett enda fält, och då skrev folk förnamnet och
                  ingenting mer. Se person-name.ts. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Förnamn">
                  <Input
                    name="firstName"
                    autoComplete="given-name"
                    defaultValue={me.firstName ?? ""}
                    required={isOwner}
                  />
                </Field>
                <Field label="Efternamn">
                  <Input
                    name="lastName"
                    autoComplete="family-name"
                    defaultValue={me.lastName ?? ""}
                    required={isOwner}
                  />
                </Field>
              </div>
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

          <Card>
            <CardHeader title="Säkerhet" />
            <ul className="divide-y divide-neutral-100">
              <SecurityRow
                title="Lösenord"
                detail={
                  me.passwordChangedAt
                    ? `Bytt ${formatDate(me.passwordChangedAt)}`
                    : `Satt ${formatDate(me.createdAt)}`
                }
              >
                {/* Bytet loggar ut överallt och tillbaka in här, se
                    changePassword. Rutan stängs därför aldrig av ett svar,
                    bara av ett fel eller av sidbytet. */}
                <ActionDialog<SaveState>
                  trigger="Byt lösenord"
                  title="Byt lösenord"
                  description="Du loggas ut på alla andra enheter."
                  action={changePassword}
                  initial={{}}
                  submitLabel="Byt lösenord"
                >
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
                </ActionDialog>
              </SecurityRow>

              {/* APPEN KOPPLAS HÄR NÄR DEN INTE ÄR KOPPLAD (2026-10-11), och
                  bara då. Att KOPPLA BORT den går fortfarande inte: den som
                  kommit åt en inloggad session ska inte kunna ta bort steget
                  som skyddar den. Nollställning sker av en ägare eller av oss.

                  Rutan öppnas direkt när man kommit hit från remsan högst
                  upp, som länkar med ?tvasteg=1. */}
              <SecurityRow
                title="Tvåstegsverifiering"
                detail={
                  me.totpEnabledAt
                    ? `Appen kopplad ${formatDate(me.totpEnabledAt)}`
                    : "Ingen app kopplad"
                }
              >
                {me.totpEnabledAt ? (
                  <Badge tone="active">På</Badge>
                ) : enrollment ? (
                  <ActionDialog<SaveState>
                    trigger="Koppla app"
                    triggerTone="primary"
                    title="Koppla autentiseringsapp"
                    description="Nästa gång du loggar in behöver du en kod från appen."
                    action={enableTwoStep}
                    initial={{}}
                    submitLabel="Koppla app"
                    pendingLabel="Kontrollerar…"
                    openOnMount={openTwoStep}
                  >
                    <TwoStepEnrollment enrollment={enrollment} />

                    <Field label="Kod" hint="Sex siffror som appen visar efter skanningen">
                      <Input
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9 ]{6,7}"
                        maxLength={7}
                        required
                      />
                    </Field>
                  </ActionDialog>
                ) : (
                  <Badge tone="warning">Av</Badge>
                )}
              </SecurityRow>

              <SecurityRow title="Inloggningar" detail="Även den här enheten">
                <form action={logoutEverywhere}>
                  <ConfirmButton
                    type="submit"
                    tone="secondary"
                    question="Logga ut på alla enheter? Du loggas också ut här."
                  >
                    Logga ut på alla enheter
                  </ConfirmButton>
                </form>
              </SecurityRow>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

/** En rad i kortet Säkerhet: vad, läget nu, och åtgärden till höger. */
function SecurityRow({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-neutral-900">{title}</p>
        <p className="mt-0.5 text-[13px] text-neutral-500">{detail}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}
