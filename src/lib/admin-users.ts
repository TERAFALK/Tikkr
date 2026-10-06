import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import { forCompany, type CompanyDb } from "./tenant";
import { normalizeEmail } from "./signup";
import { recordAudit } from "./audit";
import { normalizePhone } from "./phone";
import { resetAdminMfa } from "./admin-mfa";

/**
 * FLERA ADMINISTRATÖRER PER FÖRETAG.
 *
 * Utöver det uppenbara — att fler än en person ska kunna sköta verksamheten —
 * löser detta ett hål: med ett enda konto är kunden utelåst för alltid om
 * lösenordet tappas bort. Två konton gör att någon alltid kommer in.
 *
 * Den inbjudne sätter sitt EGET lösenord via en engångslänk. Alternativet, att
 * någon hittar på ett lösenord åt en annan person, gör att lösenordet passerar
 * genom chatt eller mejl och är känt av två personer från start.
 */

export class AdminUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminUserError";
  }
}

/** En inbjudan som ingen använt blir ogiltig efter en vecka. */
export const INVITE_DAYS = 7;

const MIN_PASSWORD_LENGTH = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Bjuder in en ny administratör och lämnar tillbaka länken EN gång.
 *
 * Bara ägare får bjuda in. En vanlig administratör som kunde skapa fler
 * administratörer skulle i praktiken vara ägare.
 */
export async function inviteAdmin(params: {
  companyId: string;
  role: string;
  invitedByEmail: string;
  email: string;
  asRole: "OWNER" | "ADMIN";
}) {
  if (params.role !== "OWNER") {
    throw new AdminUserError("Endast ägare kan bjuda in fler administratörer.");
  }

  const email = normalizeEmail(params.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AdminUserError("Kontrollera e-postadressen.");
  }

  // Adressen är unik i hela systemet — en person kan inte vara administratör
  // hos två företag med samma inloggning.
  const existing = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { email },
    select: { companyId: true },
  });

  if (existing) {
    throw new AdminUserError(
      existing.companyId === params.companyId
        ? "Adressen tillhör redan en administratör i arbetsytan."
        : "Adressen används redan av ett konto i Tikkr."
    );
  }

  const token = randomBytes(32).toString("base64url");
  const db = forCompany(params.companyId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_DAYS);

  // upsert: bjuder man in samma adress igen ersätts den gamla länken. Två
  // giltiga länkar till samma person är bara förvirrande.
  await db.adminInvite.upsert({
    where: { companyId_email: { companyId: params.companyId, email } },
    update: {
      tokenHash: hashToken(token),
      role: params.asRole,
      expiresAt,
      acceptedAt: null,
      invitedByEmail: params.invitedByEmail,
    },
    create: {
      companyId: params.companyId,
      email,
      role: params.asRole,
      tokenHash: hashToken(token),
      expiresAt,
      invitedByEmail: params.invitedByEmail,
    },
  });

  return { token, email, expiresAt };
}

export interface PendingInvite {
  email: string;
  role: string;
  companyName: string;
}

/** Slår upp en inbjudan utan att förbruka den. Används för att visa formuläret. */
export async function findInvite(token: string): Promise<PendingInvite | null> {
  if (!token) return null;

  const invite = await unsafeGlobalPrisma.adminInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { company: { select: { name: true } } },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return null;

  return {
    email: invite.email,
    role: invite.role,
    companyName: invite.company.name,
  };
}

/**
 * Löser in en inbjudan: skapar kontot med det lösenord personen valt.
 *
 * Inbjudan markeras som använd i samma transaktion som kontot skapas, så att
 * samma länk inte kan ge två konton om den öppnas i två flikar.
 */
export async function acceptInvite(
  token: string,
  password: string,
  profile: { name?: string; phone?: string } = {}
) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AdminUserError(
      `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`
    );
  }

  // Namn och telefon är frivilliga för den som bjuds in. Ägaren som
  // registrerade arbetsytan har redan lämnat sina, och det är dem vi ringer.
  // Skrivs ett nummer ändå ska det gå att använda.
  const name = profile.name?.trim() || null;
  const rawPhone = profile.phone?.trim() ?? "";
  const phone = rawPhone ? normalizePhone(rawPhone) : null;

  if (rawPhone && !phone) {
    throw new AdminUserError("Kontrollera telefonnumret.");
  }

  const invite = await unsafeGlobalPrisma.adminInvite.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new AdminUserError(
      "Länken är ogiltig eller har upphört att gälla. Begär en ny inbjudan."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  return unsafeGlobalPrisma.$transaction(async (tx) => {
    const claimed = await tx.adminInvite.updateMany({
      where: { id: invite.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });

    // Hann någon annan lösa in den mellan uppslaget och nu blir count noll.
    if (claimed.count === 0) {
      throw new AdminUserError("Länken är redan använd.");
    }

    const user = await tx.adminUser.create({
      data: {
        companyId: invite.companyId,
        email: invite.email,
        name,
        phone,
        passwordHash,
        role: invite.role,
        // Länken kom med mejl till just den här adressen. Att den används
        // bevisar att adressen fungerar, och någon bekräftelse till behövs
        // inte.
        emailVerifiedAt: new Date(),
      },
    });

    // Den som bjöd in står som upphov. Det var hen som gav behörigheten,
    // inbjudan bara bar den.
    await tx.auditEvent.create({
      data: {
        companyId: invite.companyId,
        actorEmail: invite.invitedByEmail,
        entity: "AdminUser",
        entityId: user.id,
        action: "create",
        after: { email: user.email, role: user.role },
      },
    });

    return user;
  });
}

/**
 * Tar bort en administratör.
 *
 * Två spärrar: man kan inte ta bort sig själv — det vore ett sätt att av
 * misstag låsa ut sig mitt i arbetet — och sista ägaren kan inte tas bort,
 * eftersom företaget då blir omöjligt att administrera.
 */
export async function removeAdmin(params: {
  companyId: string;
  actingUserId: string;
  actingRole: string;
  /** Den som tar bort. Skrivs i ändringsloggen. */
  actingEmail: string;
  targetUserId: string;
}) {
  if (params.actingRole !== "OWNER") {
    throw new AdminUserError("Endast ägare kan ta bort administratörer.");
  }

  if (params.actingUserId === params.targetUserId) {
    throw new AdminUserError("Du kan inte ta bort ditt eget konto.");
  }

  const db = forCompany(params.companyId);
  const target = await db.adminUser.findFirst({
    where: { id: params.targetUserId },
  });

  if (!target) throw new AdminUserError("Kontot finns inte.");

  if (target.role === "OWNER") {
    const owners = await db.adminUser.count({ where: { role: "OWNER" } });
    if (owners <= 1) {
      throw new AdminUserError(
        "Arbetsytan måste ha minst en ägare. Utse en ny ägare först."
      );
    }
  }

  await db.adminUser.delete({ where: { id: params.targetUserId } });

  // Vem som kom åt arbetsytan, och när det tog slut. E-postadressen står
  // med: den är vad som identifierar kontot, och kontot är borta.
  await recordAudit(db, {
    companyId: params.companyId,
    actorEmail: params.actingEmail,
    entity: "AdminUser",
    entityId: target.id,
    action: "delete",
    before: { email: target.email, role: target.role },
  });
}

/**
 * ÄGAREN NOLLSTÄLLER EN ADMINISTRATÖRS TVÅSTEGSINLOGGNING (infört 2026-10-06).
 *
 * För administratören som tappat sin telefon. Ägaren känner personen och kan
 * avgöra om det verkligen är hen som frågar, och slipper gå via oss.
 *
 * Samma uppdelning som behörigheterna i övrigt, åt ett håll i taget: ägaren
 * nollställer ADMINISTRATÖRER, och vi nollställer ÄGARE från plattformspanelen.
 * En ägare kan alltså inte nollställa en annan ägare. Annars kunde den som
 * kommit åt ett ägarkonto ta över de andra ägarnas konton också, och det är
 * just de som ska kunna stänga ute en inkräktare.
 *
 * Nästa inloggning visar en ny QR-kod, och personens sessioner avslutas, se
 * resetAdminMfa. Skrivs i kundens ändringslogg.
 */
export async function resetTwoStepByOwner(params: {
  companyId: string;
  actingUserId: string;
  actingRole: string;
  actingEmail: string;
  targetUserId: string;
}) {
  if (params.actingRole !== "OWNER") {
    throw new AdminUserError(
      "Endast ägare kan nollställa tvåstegsinloggningen."
    );
  }

  if (params.actingUserId === params.targetUserId) {
    throw new AdminUserError(
      "Din egen tvåstegsinloggning nollställs av Tikkr. Kontakta support@tikkr.se."
    );
  }

  const db = forCompany(params.companyId);
  const target = await db.adminUser.findFirst({
    where: { id: params.targetUserId },
    select: { id: true, role: true, totpEnabledAt: true },
  });

  if (!target) throw new AdminUserError("Kontot finns inte.");

  if (target.role === "OWNER") {
    throw new AdminUserError(
      "En ägares tvåstegsinloggning nollställs av Tikkr. Kontakta support@tikkr.se."
    );
  }

  await resetAdminMfa(target.id);

  await recordAudit(db, {
    companyId: params.companyId,
    actorEmail: params.actingEmail,
    entity: "AdminUser",
    entityId: target.id,
    action: "update",
    before: { twoStep: target.totpEnabledAt ? "Uppsatt" : "Inte uppsatt" },
    after: { twoStep: "Nollställd" },
  });
}

/** Återkallar en inbjudan som ännu inte lösts in. */
export async function revokeInvite(params: {
  companyId: string;
  actingRole: string;
  inviteId: string;
}) {
  if (params.actingRole !== "OWNER") {
    throw new AdminUserError("Endast ägare kan återkalla inbjudningar.");
  }

  const db = forCompany(params.companyId);
  await db.adminInvite.deleteMany({
    where: { id: params.inviteId, acceptedAt: null },
  });
}

export async function listAdmins(db: CompanyDb) {
  const [users, invites] = await Promise.all([
    db.adminUser.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        totpEnabledAt: true,
      },
    }),
    db.adminInvite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        invitedByEmail: true,
      },
    }),
  ]);

  return { users, invites };
}
