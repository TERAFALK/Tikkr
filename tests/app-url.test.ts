import { describe, it, expect } from "vitest";
import { resolveAppUrl } from "@/lib/app-url";

/**
 * Adressen i återställningslänkar, inbjudningar och Stripes återvägar.
 *
 * Den byggdes ur anropets X-Forwarded-Host, och den som begärde en återställning
 * åt någon annan kunde därmed välja vart länken i det äkta mejlet pekade. Det
 * testerna skyddar: adressen kommer bara ur inställningen, och saknas den finns
 * ingen adress alls i stället för en gissning.
 */

describe("adressen kommer ur inställningen", () => {
  it("APP_URL används som den står", () => {
    expect(resolveAppUrl({ APP_URL: "https://www.tikkr.se" })).toBe(
      "https://www.tikkr.se"
    );
  });

  it("snedstreck och sökväg på slutet tas bort", () => {
    // Annars blir länken "https://www.tikkr.se//admin/aterstall/…".
    expect(resolveAppUrl({ APP_URL: "https://portal.tikkr.se/" })).toBe(
      "https://portal.tikkr.se"
    );
    expect(resolveAppUrl({ APP_URL: "https://portal.tikkr.se/admin" })).toBe(
      "https://portal.tikkr.se"
    );
  });

  it("APP_URL går före PORTAL_HOST", () => {
    expect(
      resolveAppUrl({
        APP_URL: "https://www.tikkr.se",
        PORTAL_HOST: "portal.tikkr.se",
      })
    ).toBe("https://www.tikkr.se");
  });

  it("PORTAL_HOST räcker när APP_URL saknas", () => {
    expect(resolveAppUrl({ PORTAL_HOST: "Portal.Tikkr.se" })).toBe(
      "https://portal.tikkr.se"
    );
  });
});

describe("utan giltig inställning finns ingen adress", () => {
  it("ingenting satt i en byggd image", () => {
    expect(resolveAppUrl({ NODE_ENV: "production" })).toBeNull();
  });

  it("en adress som inte går att tolka", () => {
    expect(resolveAppUrl({ APP_URL: "www.tikkr.se" })).toBeNull();
  });

  it("ett annat schema än http och https", () => {
    expect(resolveAppUrl({ APP_URL: "javascript:alert(1)" })).toBeNull();
  });

  it("utvecklingsläget får localhost", () => {
    expect(resolveAppUrl({ NODE_ENV: "development" })).toBe(
      "http://localhost:3000"
    );
  });
});
