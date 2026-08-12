import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-session";
import { listAdmins } from "@/lib/admin-users";
import InviteAdminForm from "@/components/admin/InviteAdminForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { cancelInvite, deleteAdmin } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireAdmin();
  const { users, invites } = await listAdmins(session.db);

  const isOwner = session.role === "OWNER";

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "http";

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Lägg upp minst två konton. Med endast ett konto blir arbetsytan otillgänglig om lösenordet tappas bort, eftersom återställning via e-post ännu inte är tillgänglig.
      </Alert>

      {isOwner && (
        <Card>
          <CardHeader
            title="Bjud in en administratör"
            description="Den inbjudne väljer sitt eget lösenord via länken."
          />
          <InviteAdminForm baseUrl={`${proto}://${host}`} />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Administratörer"
          description="Ägare kan bjuda in och ta bort konton. Administratörer har tillgång till verksamheten men inte till kontohantering."
        />
        <Table>
          <thead>
            <tr>
              <Th>E-postadress</Th>
              <Th>Behörighet</Th>
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
                  <span className="font-medium">{user.email}</span>
                  {user.id === session.userId && (
                    <span className="ml-2 text-neutral-400">(du)</span>
                  )}
                </Td>
                <Td>
                  {user.role === "OWNER" ? (
                    <Badge tone="active">Ägare</Badge>
                  ) : (
                    <Badge>Administratör</Badge>
                  )}
                </Td>
                <Td muted>{formatDate(user.createdAt)}</Td>
                <Td>
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
            description="Inbjudningar som ännu inte lösts in."
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
