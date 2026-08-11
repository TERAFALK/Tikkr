import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  acceptInvite,
  findInvite,
  inviteAdmin,
  listAdmins,
  removeAdmin,
  revokeInvite,
  AdminUserError,
} from "@/lib/admin-users";

/**
 * Flera administratörer per företag.
 *
 * De viktigaste reglerna att skydda: bara ägaren får bjuda in, sista ägaren
 * kan inte tas bort, och en inbjudningslänk fungerar exakt en gång.
 */

let companyId: string;
let ownerId: string;
let ownerEmail: string;
let unique: string;

/**
 * Egen adress per test.
 *
 * E-postadresser är unika i HELA systemet, inte per företag. Använde alla
 * tester samma adress skulle det första testet lägga beslag på den och resten
 * falla — vilket är precis vad som hände första gången.
 */
function addr(prefix: string): string {
  return `${prefix}-${unique}@example.com`;
}

beforeEach(async () => {
  unique = Math.random().toString(36).slice(2, 10);

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Anvandartest ${unique}` },
  });
  companyId = company.id;

  ownerEmail = addr("agare");
  const owner = await unsafeGlobalPrisma.adminUser.create({
    data: {
      companyId,
      email: ownerEmail,
      passwordHash: await bcrypt.hash("ett-langt-losenord", 12),
      role: "OWNER",
    },
  });
  ownerId = owner.id;
});

// Varje test städar efter sig. Cascade tar med administratörer och
// inbjudningar, så adresserna frigörs direkt istället för vid körningens slut.
afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Anvandartest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

function invite(email: string, asRole: "OWNER" | "ADMIN" = "ADMIN") {
  return inviteAdmin({
    companyId,
    role: "OWNER",
    invitedByEmail: ownerEmail,
    email,
    asRole,
  });
}

describe("bjuda in", () => {
  it("ger en länk och en väntande inbjudan", async () => {
    const { token } = await invite(addr("ny"));

    expect(token.length).toBeGreaterThan(30);

    const pending = await findInvite(token);
    expect(pending?.email).toBe(addr("ny"));
    expect(pending?.role).toBe("ADMIN");
  });

  it("bara ägaren får bjuda in", async () => {
    await expect(
      inviteAdmin({
        companyId,
        role: "ADMIN",
        invitedByEmail: addr("vanlig"),
        email: addr("ny"),
        asRole: "ADMIN",
      })
    ).rejects.toThrow(AdminUserError);
  });

  it("vägrar en adress som redan är administratör", async () => {
    await expect(invite(ownerEmail)).rejects.toThrow(AdminUserError);
  });

  it("vägrar orimlig e-postadress", async () => {
    await expect(invite("inte-en-adress")).rejects.toThrow(AdminUserError);
  });

  it("ny inbjudan till samma adress ersätter den gamla", async () => {
    const first = await invite(addr("ny"));
    const second = await invite(addr("ny"));

    expect(await findInvite(first.token)).toBeNull();
    expect(await findInvite(second.token)).not.toBeNull();

    const { invites } = await listAdmins(forCompany(companyId));
    expect(invites).toHaveLength(1);
  });
});

describe("lösa in en inbjudan", () => {
  it("skapar kontot med personens eget lösenord", async () => {
    const { token } = await invite(addr("ny"));
    const user = await acceptInvite(token, "mitt-eget-losenord");

    expect(user.email).toBe(addr("ny"));
    expect(user.companyId).toBe(companyId);
    expect(user.role).toBe("ADMIN");
    expect(await bcrypt.compare("mitt-eget-losenord", user.passwordHash)).toBe(
      true
    );
  });

  it("länken fungerar bara en gång", async () => {
    const { token } = await invite(addr("ny"));
    await acceptInvite(token, "mitt-eget-losenord");

    await expect(acceptInvite(token, "ett-annat-losenord")).rejects.toThrow(
      AdminUserError
    );
  });

  it("vägrar för kort lösenord", async () => {
    const { token } = await invite(addr("ny"));

    await expect(acceptInvite(token, "kort")).rejects.toThrow(AdminUserError);
    // Inbjudan ska fortfarande gå att använda med ett bättre lösenord.
    expect(await findInvite(token)).not.toBeNull();
  });

  it("vägrar en utgången inbjudan", async () => {
    const { token } = await invite(addr("ny"));

    await unsafeGlobalPrisma.adminInvite.updateMany({
      where: { companyId },
      data: { expiresAt: new Date("2020-01-01") },
    });

    expect(await findInvite(token)).toBeNull();
    await expect(acceptInvite(token, "mitt-eget-losenord")).rejects.toThrow(
      AdminUserError
    );
  });

  it("en påhittad länk ger ingenting", async () => {
    expect(await findInvite("hittepa-token")).toBeNull();
  });

  it("återkallad inbjudan går inte att lösa in", async () => {
    const { token } = await invite(addr("ny"));
    const { invites } = await listAdmins(forCompany(companyId));

    await revokeInvite({
      companyId,
      actingRole: "OWNER",
      inviteId: invites[0].id,
    });

    await expect(acceptInvite(token, "mitt-eget-losenord")).rejects.toThrow(
      AdminUserError
    );
  });
});

describe("ta bort administratörer", () => {
  it("ägaren kan ta bort en vanlig administratör", async () => {
    const { token } = await invite(addr("ny"));
    const user = await acceptInvite(token, "mitt-eget-losenord");

    await removeAdmin({
      companyId,
      actingUserId: ownerId,
      actingRole: "OWNER",
      targetUserId: user.id,
    });

    const { users } = await listAdmins(forCompany(companyId));
    expect(users).toHaveLength(1);
  });

  it("man kan inte ta bort sitt eget konto", async () => {
    await expect(
      removeAdmin({
        companyId,
        actingUserId: ownerId,
        actingRole: "OWNER",
        targetUserId: ownerId,
      })
    ).rejects.toThrow(AdminUserError);
  });

  it("sista ägaren kan inte tas bort", async () => {
    const { token } = await invite(addr("andra"), "OWNER");
    const andraAgaren = await acceptInvite(token, "mitt-eget-losenord");

    // Två ägare: nu går det.
    await removeAdmin({
      companyId,
      actingUserId: andraAgaren.id,
      actingRole: "OWNER",
      targetUserId: ownerId,
    });

    // En ägare kvar: nu ska det vägras.
    const { token: tredje } = await inviteAdmin({
      companyId,
      role: "OWNER",
      invitedByEmail: addr("andra"),
      email: addr("tredje"),
      asRole: "ADMIN",
    });
    const vanlig = await acceptInvite(tredje, "mitt-eget-losenord");

    await expect(
      removeAdmin({
        companyId,
        actingUserId: vanlig.id,
        actingRole: "OWNER",
        targetUserId: andraAgaren.id,
      })
    ).rejects.toThrow(AdminUserError);
  });

  it("en vanlig administratör får inte ta bort någon", async () => {
    await expect(
      removeAdmin({
        companyId,
        actingUserId: "nagon",
        actingRole: "ADMIN",
        targetUserId: ownerId,
      })
    ).rejects.toThrow(AdminUserError);
  });
});

describe("isolering mellan företag", () => {
  it("ett företags administratörer syns inte hos ett annat", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Anvandartest grannen" },
    });

    const { users } = await listAdmins(forCompany(other.id));
    expect(users).toEqual([]);

    const mine = await listAdmins(forCompany(companyId));
    expect(mine.users).toHaveLength(1);
  });
});
