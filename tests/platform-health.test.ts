import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`Oväntad omdirigering till ${to}`);
  },
}));

const {
  endingTrials,
  quietCustomers,
  silentDevices,
  QUIET_CUSTOMER_DAYS,
  SILENT_DEVICE_HOURS,
} = await import("@/lib/platform-health");

/**
 * Bevakningslistorna.
 *
 * De besvarar frågan "vad behöver jag göra i dag som jag annars får veta av en
 * irriterad kund om två veckor". Ett fel här märks inte — listan är ju tom, och
 * en tom lista ser likadan ut oavsett om allt är bra eller om frågan är fel
 * ställd. Därför testas både att rätt saker kommer med och att fel saker inte
 * gör det.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let unique: string;
let companyId: string;

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

async function addDevice(data: { lastSeenAt: Date | null; active?: boolean }) {
  return unsafeGlobalPrisma.kioskDevice.create({
    data: {
      companyId,
      name: `Skärm ${Math.random().toString(36).slice(2, 8)}`,
      tokenHash: Math.random().toString(36).slice(2),
      active: data.active ?? true,
      lastSeenAt: data.lastSeenAt,
    },
  });
}

beforeEach(async () => {
  unique = Math.random().toString(36).slice(2, 10);

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Bevakningstest ${unique}` },
  });

  companyId = company.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Bevakningstest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("skärmar som slutat höra av sig", () => {
  it("en skärm som varit tyst ett dygn kommer med", async () => {
    const device = await addDevice({ lastSeenAt: ago(SILENT_DEVICE_HOURS * HOUR + HOUR) });

    const list = await silentDevices();
    expect(list.map((row) => row.id)).toContain(device.id);
  });

  it("en skärm som hördes av nyss kommer inte med", async () => {
    const device = await addDevice({ lastSeenAt: ago(HOUR) });

    const list = await silentDevices();
    expect(list.map((row) => row.id)).not.toContain(device.id);
  });

  it("en aldrig kopplad skärm kommer inte med", async () => {
    // Den är inte trasig, bara oanvänd — och skulle annars ligga kvar i
    // listan för alltid.
    const device = await addDevice({ lastSeenAt: null });

    const list = await silentDevices();
    expect(list.map((row) => row.id)).not.toContain(device.id);
  });

  it("en återkallad skärm kommer inte med", async () => {
    const device = await addDevice({
      lastSeenAt: ago(5 * DAY),
      active: false,
    });

    const list = await silentDevices();
    expect(list.map((row) => row.id)).not.toContain(device.id);
  });
});

describe("provperioder som snart går ut", () => {
  it("kommer med när slutdatumet är inom en vecka", async () => {
    await unsafeGlobalPrisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + 3 * DAY),
      },
    });

    const list = await endingTrials();
    expect(list.map((row) => row.companyId)).toContain(companyId);
  });

  it("kommer inte med när det är långt kvar", async () => {
    await unsafeGlobalPrisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + 20 * DAY),
      },
    });

    const list = await endingTrials();
    expect(list.map((row) => row.companyId)).not.toContain(companyId);
  });

  it("betalande kunder kommer aldrig med", async () => {
    await unsafeGlobalPrisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: "ACTIVE",
        trialEndsAt: new Date(Date.now() + 2 * DAY),
      },
    });

    const list = await endingTrials();
    expect(list.map((row) => row.companyId)).not.toContain(companyId);
  });
});

describe("betalande kunder som slutat registrera tid", () => {
  async function makePaying() {
    await unsafeGlobalPrisma.company.update({
      where: { id: companyId },
      data: { subscriptionStatus: "ACTIVE", screenLicenses: 2 },
    });
  }

  async function addEntry(clockInAt: Date) {
    const [employee, order, moment] = await Promise.all([
      unsafeGlobalPrisma.employee.create({
        data: { companyId, name: `Anställd ${unique}` },
      }),
      unsafeGlobalPrisma.order.create({
        data: { companyId, orderNumber: `O-${unique}` },
      }),
      unsafeGlobalPrisma.workMoment.create({
        data: { companyId, name: `Moment ${unique}` },
      }),
    ]);

    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: employee.id,
        orderId: order.id,
        momentId: moment.id,
        clockInAt,
        clockOutAt: new Date(clockInAt.getTime() + HOUR),
      },
    });
  }

  it("kommer med efter två tysta veckor", async () => {
    await makePaying();
    await addEntry(ago((QUIET_CUSTOMER_DAYS + 3) * DAY));

    const list = await quietCustomers();
    expect(list.map((row) => row.companyId)).toContain(companyId);
  });

  it("kommer inte med när tid registrerats nyligen", async () => {
    await makePaying();
    await addEntry(ago(2 * DAY));

    const list = await quietCustomers();
    expect(list.map((row) => row.companyId)).not.toContain(companyId);
  });

  it("en betalande kund som aldrig registrerat tid kommer med", async () => {
    await makePaying();

    const list = await quietCustomers();
    const row = list.find((item) => item.companyId === companyId);

    expect(row).toBeDefined();
    expect(row?.quietDays).toBeNull();
  });

  it("en provperiod kommer inte med, hur tyst den än är", async () => {
    // Listan handlar om kunder som betalar för något de slutat använda.
    const list = await quietCustomers();
    expect(list.map((row) => row.companyId)).not.toContain(companyId);
  });
});
