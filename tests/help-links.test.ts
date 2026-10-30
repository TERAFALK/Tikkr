import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * LÄNKARNA TILL ARBETSTIDERNA.
 *
 * Arbetstiderna flyttade från `/installningar/schema` till
 * `/installningar/arbetstider` den 17 oktober, och adressen de lämnade blev
 * sidan för rasttyper. Två länkar följde inte med: den på Tidrapport och steget
 * i Kom igång. Båda fungerade, så inget annat test föll, men den som skulle
 * lägga upp sitt schema hamnade på fel sida.
 */
const SRC = path.resolve(__dirname, "..", "src");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8");

describe("vägen till arbetstiderna", () => {
  it("Kom igång leder till arbetstiderna", () => {
    const step = read("lib/onboarding.ts").match(
      /href: "([^"]+)",\s*action: "Till arbetstider"/
    );

    expect(step?.[1]).toBe("/admin/installningar/arbetstider");
  });

  it("varningen på Tidrapport leder till arbetstiderna", () => {
    const link = read("app/admin/(panel)/tidrapport/page.tsx").match(
      /href="([^"]+)"[^>]*>\s*Lägg upp ett schema/
    );

    expect(link?.[1]).toBe("/admin/installningar/arbetstider");
  });
});
