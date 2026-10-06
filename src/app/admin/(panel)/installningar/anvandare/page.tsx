import { requireAdmin } from "@/lib/admin-session";
import { resolveAppUrl } from "@/lib/app-url";
import { listAdmins } from "@/lib/admin-users";
import InviteAdminForm from "@/components/admin/InviteAdminForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import SaveForm from "@/components/admin/SaveForm";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Field,
  Input,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  cancelInvite,
  changeEmail,
  changePassword,
  deleteAdmin,
  logoutEverywhere,
  resetTwoStep,
  saveOwnProfile,
} from "./actions";

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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ bekraftelse?: string }>;
}) {
  const session = await requireAdmin();
  const resend = RESEND_MESSAGES[(await searchParams).bekraftelse ?? ""];
  const { users, invites } = await listAdmins(session.db);

  const isOwner = session.role === "OWNER";

  // Det egna kontot. Finns inte i supportläget, där ingen är inloggad som
  // kunden.
  const me = session.support
    ? null
    : await session.db.adminUser.findFirst({
        where: { id: session.userId },
        select: { name: true, phone: true, email: true, emailVerifiedAt: true },
      });

  // Samma adress som i mejlet, se app-url.ts. Saknas inställningen visas
  // sökvägen ensam hellre än en länk till en värd anropet hittat på.
  const baseUrl = resolveAppUrl(process.env) ?? "";

  return (
    <div className="space-y-6">
      {/* SKÄLET ÄR INTE LÄNGRE GLÖMDA LÖSENORD. Texten påstod att
          återställning via e-post inte fanns, vilket slutade vara sant när
          /admin/glomt-losenord togs i bruk. Kvar står det som faktiskt gäller:
          med ett enda konto finns ingen annan som kommer in när personen är
          borta eller slutar. */}
      <Alert tone="info">
        Lägg upp minst två konton. Med ett enda konto kommer ingen annan in i
        arbetsytan.
      </Alert>

      {resend && <Alert tone={resend.tone}>{resend.text}</Alert>}

      {me && (
        <Card>
          <CardHeader title="Ditt konto" />
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
      )}

      {/* En OBEKRÄFTAD adress går att rätta här, för stavfelet vid
          registreringen. En bekräftad är kontots identitet och byts via
          support. Se email-verification.ts. */}
      {me && !me.emailVerifiedAt && (
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

      {me && (
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
      )}

      {isOwner && (
        <Card>
          <CardHeader
            title="Bjud in en administratör"
          />
          <InviteAdminForm baseUrl={baseUrl} />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Administratörer"
          description="Endast ägare kan bjuda in och ta bort konton."
        />
        <Table>
          <thead>
            <tr>
              <Th>Namn</Th>
              <Th>Behörighet</Th>
              <Th>Tvåsteg</Th>
              <Th>Upplagd</Th>
              <Th>
                <span className="sr-only">Åtgärder</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <Tr key={user.id}>
                <Td>
                  <span className="font-medium">{user.name ?? user.email}</span>
                  {user.id === session.userId && (
                    <span className="ml-2 text-neutral-400">(du)</span>
                  )}
                  {user.name && (
                    <span className="mt-0.5 block text-xs text-neutral-400">
                      {user.email}
                    </span>
                  )}
                </Td>
                <Td>
                  {user.role === "OWNER" ? (
                    <Badge tone="active">Ägare</Badge>
                  ) : (
                    <Badge>Administratör</Badge>
                  )}
                </Td>
                <Td>
                  {user.totpEnabledAt ? (
                    <Badge tone="active">Uppsatt</Badge>
                  ) : (
                    <Badge tone="muted">Inte uppsatt</Badge>
                  )}
                </Td>
                <Td muted>{formatDate(user.createdAt)}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                  {/* Ägaren nollställer administratörer, Tikkr nollställer
                      ägare. Se resetTwoStepByOwner i admin-users.ts. */}
                  {isOwner &&
                    user.role === "ADMIN" &&
                    user.totpEnabledAt && (
                      <form action={resetTwoStep}>
                        <input type="hidden" name="userId" value={user.id} />
                        <ConfirmButton
                          type="submit"
                          tone="secondary"
                          question={`Nollställ tvåstegsinloggningen för ${user.email}? Nästa inloggning visar en ny QR-kod, och personen loggas ut överallt.`}
                        >
                          Nollställ tvåsteg
                        </ConfirmButton>
                      </form>
                    )}
                  {isOwner && user.id !== session.userId && (
                    <form action={deleteAdmin}>
                      <input type="hidden" name="userId" value={user.id} />
                      <ConfirmButton
                        type="submit"
                        tone="danger"
                        question={`Ta bort ${user.email}? Personen kommer inte längre in i arbetsytan.`}
                      >
                        Ta bort
                      </ConfirmButton>
                    </form>
                  )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader
            title="Väntar på svar"
          />
          <Table>
            <thead>
              <tr>
                <Th>E-postadress</Th>
                <Th>Behörighet</Th>
                <Th>Gäller till</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <Tr key={invite.id}>
                  <Td>{invite.email}</Td>
                  <Td muted>
                    {invite.role === "OWNER" ? "Ägare" : "Administratör"}
                  </Td>
                  <Td muted>{formatDateTime(invite.expiresAt)}</Td>
                  <Td>
                    {isOwner && (
                      <form action={cancelInvite}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <ConfirmButton
                          type="submit"
                          tone="secondary"
                          question={`Återkalla inbjudan till ${invite.email}? Länken slutar fungera direkt.`}
                        >
                          Återkalla
                        </ConfirmButton>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
