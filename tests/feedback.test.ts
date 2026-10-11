import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, ReadOnlyError } from "@/lib/tenant";
import {
  cleanPage,
  FeedbackError,
  hasUnseenSupportUpdates,
  HOURLY_LIMIT,
  listCompanyFeedback,
  markSupportSeen,
  MAX_BODY_LENGTH,
  replyToFeedback,
  sendFeedback,
  setFeedbackStatus,
  type FeedbackAuthor,
} from "@/lib/feedback";

/**
 * SUPPORTEN: MEDDELANDEN FRÅN KUNDEN, SVAR FRÅN OSS.
 *
 * Det som måste hålla:
 *   företaget kommer ur kundens klient, och kund A ser aldrig kund B:s rader
 *   supportläget kan inte skicka något i kundens namn
 *   ett svar på ett nytt meddelande gör det till Pågår, och tänder pricken
 *   pricken gäller bara personens egna meddelanden
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
    expect(sent.status).toBe("NEW");
    expect(sent.area).toBe("PLANNING");
    expect(sent.page).toBe("/admin/planering");
  });

  it("kund A:s meddelanden syns aldrig för kund B", async () => {
    await sendFeedback(author(), message);

    expect(await listCompanyFeedback(forCompany(companyA))).toHaveLength(1);
    expect(await listCompanyFeedback(forCompany(companyB))).toEqual([]);
    expect(await forCompany(companyB).feedbackMessage.count()).toBe(0);
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

describe("inkorgen", () => {
  it("ett svar hamnar hos rätt företag och gör ett nytt meddelande till Pågår", async () => {
    const sent = await sendFeedback(author(), message);
    await replyToFeedback({ id: sent.id, body: "Vi tittar på det.", byEmail: PLATFORM });

    const [listed] = await listCompanyFeedback(forCompany(companyA));
    expect(listed.status).toBe("IN_PROGRESS");
    expect(listed.statusChangedByEmail).toBe(PLATFORM);
    expect(listed.replies.map((reply) => reply.body)).toEqual(["Vi tittar på det."]);
    expect(listed.replies[0].companyId).toBe(companyA);

    const log = await unsafeGlobalPrisma.platformAuditLog.findMany({
      where: { targetCompanyId: companyA },
    });
    expect(log.map((row) => row.action)).toEqual(["Svarade på supportmeddelande"]);
  });

  it("ett svar öppnar inte ett meddelande som är klart", async () => {
    const sent = await sendFeedback(author(), message);
    await setFeedbackStatus({ id: sent.id, status: "DONE", byEmail: PLATFORM });
    await replyToFeedback({ id: sent.id, body: "Ett tillägg.", byEmail: PLATFORM });

    const row = await unsafeGlobalPrisma.feedbackMessage.findUniqueOrThrow({ where: { id: sent.id } });
    expect(row.status).toBe("DONE");
  });

  it("tomt svar avvisas", async () => {
    const sent = await sendFeedback(author(), message);
    await expect(
      replyToFeedback({ id: sent.id, body: " ", byEmail: PLATFORM })
    ).rejects.toThrow(FeedbackError);
  });

  it("statusbyte loggas, och samma status igen gör ingenting", async () => {
    const sent = await sendFeedback(author(), message);
    await setFeedbackStatus({ id: sent.id, status: "DONE", byEmail: PLATFORM });
    await setFeedbackStatus({ id: sent.id, status: "DONE", byEmail: PLATFORM });

    const log = await unsafeGlobalPrisma.platformAuditLog.findMany({
      where: { targetCompanyId: companyA },
    });
    expect(log).toHaveLength(1);
    expect(log[0].detail).toContain("Ny → Klar");
  });
});

describe("pricken vid Support", () => {
  it("tänds av ett svar och släcks när sidan öppnas", async () => {
    const db = forCompany(companyA);
    const sent = await sendFeedback(author(), message);
    expect(await hasUnseenSupportUpdates(db, userA, null)).toBe(false);

    const before = new Date(Date.now() - 1000);
    await replyToFeedback({ id: sent.id, body: "Rättat.", byEmail: PLATFORM });
    expect(await hasUnseenSupportUpdates(db, userA, before)).toBe(true);

    await markSupportSeen(db, userA);
    const { supportSeenAt } = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: userA },
    });
    expect(await hasUnseenSupportUpdates(db, userA, supportSeenAt)).toBe(false);
  });

  it("en kollegas svar tänder ingen prick", async () => {
    const sent = await sendFeedback(author(colleagueA), message);
    await replyToFeedback({ id: sent.id, body: "Rättat.", byEmail: PLATFORM });

    expect(await hasUnseenSupportUpdates(forCompany(companyA), userA, null)).toBe(false);
    expect(await hasUnseenSupportUpdates(forCompany(companyA), colleagueA, null)).toBe(true);
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
