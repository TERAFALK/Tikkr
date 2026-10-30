import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, ReadOnlyError } from "@/lib/tenant";
import {
  cleanPage,
  FeedbackError,
  HOURLY_LIMIT,
  listInbox,
  markFeedbackDone,
  MAX_BODY_LENGTH,
  sendFeedback,
  type FeedbackAuthor,
} from "@/lib/feedback";

/**
 * FEL OCH FÖRSLAG: FRÅN KUNDENS RUTA TILL VÅR INKORG OCH VÅRT ARKIV.
 *
 * Det som måste hålla:
 *   företaget kommer ur kundens klient, och kund A ser aldrig kund B:s rader
 *   supportläget kan inte skicka något i kundens namn
 *   klarmarkering kräver en anteckning och flyttar meddelandet till arkivet
 *   meddelandet står kvar när avsändarens konto tas bort
 */

let companyA: string;
let companyB: string;
let userA: string;
let colleagueA: string;

const PLATFORM = "vi@tikkr.se";

function author(userId = userA, companyId = companyA): FeedbackAuthor {
  return {
    db: forCompany(companyId),
    companyId,
    userId,
    email: `${userId}@example.se`,
    name: "Anna Andersson",
  };
}

const message = { kind: "BUG", area: "PLANNING", page: "/admin/planering", body: "Rutan går inte att flytta." };

async function createUser(companyId: string) {
  const user = await unsafeGlobalPrisma.adminUser.create({
    data: {
      companyId,
      email: `${Math.random().toString(36).slice(2, 10)}@example.se`,
      passwordHash: "x",
    },
  });
  return user.id;
}

beforeEach(async () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  companyA = (await unsafeGlobalPrisma.company.create({ data: { name: `Support A ${suffix}` } })).id;
  companyB = (await unsafeGlobalPrisma.company.create({ data: { name: `Support B ${suffix}` } })).id;
  userA = await createUser(companyA);
  colleagueA = await createUser(companyA);
});

afterEach(async () => {
  // Plattformens logg har ingen koppling till företaget och följer inte med
  // i kaskaden. Meddelandena och svaren gör det.
  await unsafeGlobalPrisma.platformAuditLog.deleteMany({
    where: { targetCompanyId: { in: [companyA, companyB] } },
  });
  await unsafeGlobalPrisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
});

describe("att skicka", () => {
  it("sparar företaget, avsändaren och sidan ur sessionen", async () => {
    const sent = await sendFeedback(author(), message);

    expect(sent.companyId).toBe(companyA);
    expect(sent.authorUserId).toBe(userA);
    expect(sent.authorName).toBe("Anna Andersson");
    expect(sent.doneAt).toBeNull();
    expect(sent.area).toBe("PLANNING");
    expect(sent.page).toBe("/admin/planering");
  });

  it("kund A:s meddelanden syns aldrig för kund B", async () => {
    await sendFeedback(author(), message);

    expect(await forCompany(companyA).feedbackMessage.count()).toBe(1);
    expect(await forCompany(companyB).feedbackMessage.findMany()).toEqual([]);
  });

  it("tomt område betyder Annat", async () => {
    const sent = await sendFeedback(author(), { ...message, area: "" });
    expect(sent.area).toBeNull();
  });

  it("avvisar tom text, okänd typ, okänt område och för lång text", async () => {
    await expect(sendFeedback(author(), { ...message, body: "   " })).rejects.toThrow(FeedbackError);
    await expect(sendFeedback(author(), { ...message, kind: "SPAM" })).rejects.toThrow(FeedbackError);
    await expect(sendFeedback(author(), { ...message, area: "LÖNEARTER" })).rejects.toThrow(FeedbackError);
    await expect(
      sendFeedback(author(), { ...message, body: "x".repeat(MAX_BODY_LENGTH + 1) })
    ).rejects.toThrow(FeedbackError);

    expect(await unsafeGlobalPrisma.feedbackMessage.count({ where: { companyId: companyA } })).toBe(0);
  });

  it(`högst ${HOURLY_LIMIT} i timmen per användare`, async () => {
    const now = new Date();
    await unsafeGlobalPrisma.feedbackMessage.createMany({
      data: Array.from({ length: HOURLY_LIMIT }, () => ({
        companyId: companyA,
        authorUserId: userA,
        authorEmail: "a@example.se",
        kind: "BUG" as const,
        body: "Igen",
        createdAt: new Date(now.getTime() - 10 * 60 * 1000),
      })),
    });

    await expect(sendFeedback(author(), message, now)).rejects.toThrow(FeedbackError);

    // En kollega på samma arbetsyta påverkas inte, och en timme senare går
    // det igen.
    await expect(sendFeedback(author(colleagueA), message, now)).resolves.toBeDefined();
    await expect(
      sendFeedback(author(), message, new Date(now.getTime() + 60 * 60 * 1000))
    ).resolves.toBeDefined();
  });

  it("supportläget kan inte skicka i kundens namn", async () => {
    await expect(
      sendFeedback({ ...author(), db: forCompany(companyA, { readOnly: true }) }, message)
    ).rejects.toThrow(ReadOnlyError);
  });

  it("meddelandet står kvar när avsändarens konto tas bort", async () => {
    const sent = await sendFeedback(author(), message);
    await unsafeGlobalPrisma.adminUser.delete({ where: { id: userA } });

    const kept = await unsafeGlobalPrisma.feedbackMessage.findUniqueOrThrow({ where: { id: sent.id } });
    expect(kept.authorUserId).toBeNull();
    expect(kept.authorEmail).toBe(`${userA}@example.se`);
  });
});

describe("inkorgen och arkivet", () => {
  const inbox = (archived: boolean) =>
    listInbox({ archived, companyId: companyA });

  it("klarmarkering flyttar till arkivet med anteckning, och loggas", async () => {
    const sent = await sendFeedback(author(), message);
    expect((await inbox(false)).rows.map((row) => row.id)).toEqual([sent.id]);
    expect((await inbox(true)).total).toBe(0);

    await markFeedbackDone({ id: sent.id, note: "Rättat i v1.4.1.", byEmail: PLATFORM });

    expect((await inbox(false)).total).toBe(0);
    const [archived] = (await inbox(true)).rows;
    expect(archived.id).toBe(sent.id);
    expect(archived.doneNote).toBe("Rättat i v1.4.1.");
    expect(archived.doneByEmail).toBe(PLATFORM);
    expect(archived.doneAt).not.toBeNull();

    const log = await unsafeGlobalPrisma.platformAuditLog.findMany({
      where: { targetCompanyId: companyA },
    });
    expect(log.map((row) => row.action)).toEqual(["Klarmarkerade fel eller förslag"]);
  });

  it("utan anteckning klarmarkeras ingenting", async () => {
    const sent = await sendFeedback(author(), message);
    await expect(
      markFeedbackDone({ id: sent.id, note: "  ", byEmail: PLATFORM })
    ).rejects.toThrow(FeedbackError);

    expect((await inbox(false)).total).toBe(1);
  });

  it("en andra klarmarkering skriver inte över den första", async () => {
    const sent = await sendFeedback(author(), message);
    await markFeedbackDone({ id: sent.id, note: "Första.", byEmail: PLATFORM });
    await expect(
      markFeedbackDone({ id: sent.id, note: "Andra.", byEmail: "annan@tikkr.se" })
    ).rejects.toThrow(FeedbackError);

    const row = await unsafeGlobalPrisma.feedbackMessage.findUniqueOrThrow({
      where: { id: sent.id },
    });
    expect(row.doneNote).toBe("Första.");
    expect(row.doneByEmail).toBe(PLATFORM);
  });

  it("kundfiltret visar bara den kundens meddelanden", async () => {
    await sendFeedback(author(), message);
    await sendFeedback(author(await createUser(companyB), companyB), message);

    const { rows } = await inbox(false);
    expect(rows.map((row) => row.companyId)).toEqual([companyA]);
  });
});

describe("sidan meddelandet skickades från", () => {
  it("sparar bara en sökväg i panelen, utan frågedel", () => {
    expect(cleanPage("/admin/planering")).toBe("/admin/planering");
    expect(cleanPage("/admin/tidrapport?anstalld=abc")).toBe("/admin/tidrapport");
    expect(cleanPage("/admin")).toBe("/admin");
    expect(cleanPage("https://example.se/admin")).toBeNull();
    expect(cleanPage("//example.se")).toBeNull();
    expect(cleanPage("/plattform")).toBeNull();
    expect(cleanPage("")).toBeNull();
    expect(cleanPage(null)).toBeNull();
  });
});
