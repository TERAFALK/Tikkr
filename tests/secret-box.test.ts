import { describe, it, expect } from "vitest";
import { openText, sealText } from "@/lib/secret-box";

/**
 * KRYPTERINGEN AV HEMLIGHETER I DATABASEN.
 *
 * Behöver ingen databas.
 */

const KEY = "testhemlighet-for-lador";

describe("secret-box", () => {
  it("öppnar det den förseglat", () => {
    const sealed = sealText('{"kioskPin":"98765432"}', "kiosk-config", KEY);
    expect(openText(sealed, "kiosk-config", KEY)).toBe('{"kioskPin":"98765432"}');
  });

  it("lämnar aldrig ut klartexten i det förseglade", () => {
    const sealed = sealText("98765432", "kiosk-config", KEY);
    expect(sealed).not.toContain("98765432");
  });

  it("samma text blir olika varje gång", () => {
    expect(sealText("a", "kiosk-config", KEY)).not.toBe(sealText("a", "kiosk-config", KEY));
  });

  it("öppnas inte med fel nyckel eller för fel ändamål", () => {
    const sealed = sealText("hemligt", "kiosk-config", KEY);
    expect(openText(sealed, "kiosk-config", "annan-nyckel")).toBeNull();
    expect(openText(sealed, "annat-andamal", KEY)).toBeNull();
  });

  it("en ändrad text avslöjas", () => {
    const sealed = sealText("hemligt", "kiosk-config", KEY);
    const [version, iv, tag, body] = sealed.split(".");
    const tampered = [version, iv, tag, body.slice(0, -2) + (body.endsWith("A") ? "BB" : "AA")].join(".");
    expect(openText(tampered, "kiosk-config", KEY)).toBeNull();
  });

  it("skräp ger null, inget fel", () => {
    expect(openText("", "kiosk-config", KEY)).toBeNull();
    expect(openText("v1.x.y", "kiosk-config", KEY)).toBeNull();
    expect(openText("v2.a.b.c", "kiosk-config", KEY)).toBeNull();
  });
});
