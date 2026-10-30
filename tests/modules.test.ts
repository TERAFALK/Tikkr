import { describe, it, expect } from "vitest";
import { MODULE_KEYS, isModuleKey } from "@/lib/modules";

/**
 * NYCKLAR UTIFRÅN.
 *
 * `isModuleKey` släpper igenom värden från formulär, Stripes rader och
 * plattformspanelen. Det som godtas här används som tillval: en rad i
 * `company_modules`, ett pris i `stripe_prices`, ett uppslag i `MODULES`.
 *
 * Kontrollen gjordes med `in`, som också är sant för nycklarna på varje
 * objekts prototyp. "toString" godtogs därmed som ett tillval.
 */

describe("isModuleKey", () => {
  it("godtar varje nyckel i registret", () => {
    for (const key of MODULE_KEYS) {
      expect(isModuleKey(key)).toBe(true);
    }
  });

  it("godtar inte prototypens nycklar", () => {
    for (const key of [
      "toString",
      "constructor",
      "hasOwnProperty",
      "valueOf",
      "__proto__",
    ]) {
      expect(isModuleKey(key), key).toBe(false);
    }
  });

  it("godtar inte okända värden", () => {
    expect(isModuleKey("payroll")).toBe(false);
    expect(isModuleKey("")).toBe(false);
    expect(isModuleKey(null)).toBe(false);
    expect(isModuleKey(undefined)).toBe(false);
    expect(isModuleKey(1)).toBe(false);
  });
});
