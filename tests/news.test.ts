import { describe, it, expect } from "vitest";
import {
  compareVersions,
  formatReleaseDate,
  hasUnreadNews,
  isUnread,
  parseVersion,
  visibleReleases,
} from "@/lib/news";
import { RELEASES, type Release } from "@/lib/release-notes";

/**
 * Nyheterna (issue #6).
 *
 * Två fel ska inte gå att göra. Det ena är att en kund läser om en version
 * som inte är installerad, vilket händer om en rättelse taggas på en main
 * där nästa versions text redan ligger. Det andra är en prick som aldrig
 * släcks, eller aldrig tänds. Ingetdera syns i en kodgranskning.
 *
 * Behöver ingen databas.
 */

const SAMPLE: Release[] = [
  {
    version: "v1.3.0",
    date: "2026-12-01",
    title: "Kommande",
    added: ["Något som inte är installerat."],
  },
  {
    version: "v1.2.0",
    date: "2026-11-01",
    title: "Planering",
    added: [
      { text: "Bara för planeringen.", module: "PLANNING" },
      "För alla.",
    ],
    fixed: [{ text: "Bara för löneunderlaget.", module: "PAYROLL" }],
  },
  {
    version: "v1.1.0",
    date: "2026-10-20",
    title: "Bara löneunderlaget",
    improved: [{ text: "Tidrapporten.", module: "PAYROLL" }],
  },
];

describe("filen med nyheterna", () => {
  it("varje version är vX.Y.Z och står bara en gång", () => {
    const versions = RELEASES.map((release) => release.version);
    for (const version of versions) expect(parseVersion(version), version).not.toBeNull();
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("nyast står överst", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(
        compareVersions(RELEASES[i - 1].version, RELEASES[i].version),
        `${RELEASES[i - 1].version} ska stå före ${RELEASES[i].version}`
      ).toBeGreaterThan(0);
      expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
  });

  it("datumen är riktiga datum", () => {
    for (const release of RELEASES) {
      expect(release.date, release.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        formatReleaseDate(release.date),
        `${release.version}: ${release.date}`
      ).not.toMatch(/Invalid/);
    }
  });

  it("varje version har en rubrik och minst en punkt", () => {
    for (const release of RELEASES) {
      expect(release.title.trim(), release.version).not.toBe("");
      const count =
        (release.added?.length ?? 0) +
        (release.improved?.length ?? 0) +
        (release.fixed?.length ?? 0);
      expect(count, release.version).toBeGreaterThan(0);
    }
  });

  it("följer språkreglerna: hela meningar, inga tankstreck, inga utrop", () => {
    // CLAUDE.md § 7.1. Texten läses av kunden, och ui-text.test.ts läser
    // inte den här filen.
    const texts = RELEASES.flatMap((release) => [
      ...(release.summary ? [release.summary] : []),
      ...[...(release.added ?? []), ...(release.improved ?? []), ...(release.fixed ?? [])].map(
        (item) => (typeof item === "string" ? item : item.text)
      ),
    ]);

    for (const text of texts) {
      expect(text, text).toMatch(/\.$/);
      expect(text, text).not.toContain("—");
      expect(text, text).not.toContain("!");
    }

    for (const release of RELEASES) {
      expect(release.title, release.title).not.toContain("—");
      expect(release.title, release.title).not.toContain("!");
    }
  });
});

describe("versionerna", () => {
  it("jämförs som tal och inte som text", () => {
    expect(compareVersions("v1.10.0", "v1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("v2.0.0", "v1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "v1.2.3")).toBe(0);
    expect(compareVersions("v1.2.3", "v1.2.4")).toBeLessThan(0);
  });

  it("bara vX.Y.Z räknas som en version", () => {
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("1.2.3")).toBeNull();
    expect(parseVersion("main-a8c77c6")).toBeNull();
    expect(parseVersion("dev")).toBeNull();
  });
});

describe("vad kunden ser", () => {
  it("visar ingen version som är nyare än den som kör", () => {
    const shown = visibleReleases("v1.2.0", ["PLANNING", "PAYROLL"], SAMPLE);
    expect(shown.map((r) => r.version)).toEqual(["v1.2.0", "v1.1.0"]);
  });

  it("visar allt i labbet och lokalt, där versionen inte är en tagg", () => {
    for (const running of ["main-a8c77c6", "dev"]) {
      const shown = visibleReleases(running, ["PLANNING", "PAYROLL"], SAMPLE);
      expect(shown.map((r) => r.version)).toEqual(["v1.3.0", "v1.2.0", "v1.1.0"]);
    }
  });

  it("visar bara punkter för kundens tillval", () => {
    const [release] = visibleReleases("v1.2.0", ["PLANNING"], SAMPLE);
    expect(release.added).toEqual(["Bara för planeringen.", "För alla."]);
    expect(release.fixed).toEqual([]);
  });

  it("utelämnar en version där ingen punkt återstår", () => {
    const shown = visibleReleases("v1.2.0", [], SAMPLE);
    expect(shown.map((r) => r.version)).toEqual(["v1.2.0"]);
    expect(shown[0].added).toEqual(["För alla."]);
  });
});

describe("pricken", () => {
  const shown = visibleReleases("v1.2.0", [], SAMPLE);

  it("står för den som aldrig öppnat sidan", () => {
    expect(hasUnreadNews(shown, null)).toBe(true);
  });

  it("står när en nyare version installerats", () => {
    expect(hasUnreadNews(shown, "v1.1.0")).toBe(true);
  });

  it("släcks när den senaste versionen är sedd", () => {
    expect(hasUnreadNews(shown, "v1.2.0")).toBe(false);
  });

  it("tänds inte när produktionen backats till en äldre version", () => {
    expect(hasUnreadNews(shown, "v1.3.0")).toBe(false);
  });

  it("tänds inte när det inte finns något att läsa", () => {
    expect(hasUnreadNews([], null)).toBe(false);
  });

  it("räknar ett trasigt lagrat värde som oläst", () => {
    expect(isUnread("v1.2.0", "main-a8c77c6")).toBe(true);
  });
});

describe("datumet", () => {
  it("skrivs ut på svenska och glider inte en dag", () => {
    expect(formatReleaseDate("2026-10-10")).toBe("10 oktober 2026");
    expect(formatReleaseDate("2026-01-01")).toBe("1 januari 2026");
  });
});
