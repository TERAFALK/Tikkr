import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { buildZip, crc32, uniqueName } from "@/lib/zip";

/**
 * ZIP-ARKIVET.
 *
 * Flera markerade ordrar ger en fil per order, och de packas ihop av vår egen
 * kod. Ett zip-format som är nästan rätt öppnas inte alls, och det skulle
 * upptäckas av kunden en fredag när tio underlag ska bifogas tio fakturor.
 *
 * Testet läser tillbaka arkivet byte för byte i stället för att bara kontrollera
 * att något kom ut: signaturerna, katalogen sist, och att innehållet går att
 * packa upp igen.
 *
 * Behöver ingen databas.
 */

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

function file(name: string, text: string) {
  return { name, data: Buffer.from(text, "utf8") };
}

describe("arkivet har rätt form", () => {
  it("börjar med en lokal rubrik och slutar med katalogen", () => {
    const zip = buildZip([file("order-1001.pdf", "hej")]);

    expect(zip.readUInt32LE(0)).toBe(LOCAL);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(END);
  });

  it("räknar filerna rätt i slutposten", () => {
    const zip = buildZip([
      file("a.pdf", "ett"),
      file("b.pdf", "två"),
      file("c.pdf", "tre"),
    ]);

    const end = zip.length - 22;
    expect(zip.readUInt16LE(end + 8)).toBe(3);
    expect(zip.readUInt16LE(end + 10)).toBe(3);
  });

  it("katalogen ligger där slutposten säger", () => {
    const zip = buildZip([file("a.pdf", "ett"), file("b.pdf", "två")]);

    const end = zip.length - 22;
    const directorySize = zip.readUInt32LE(end + 12);
    const directoryStart = zip.readUInt32LE(end + 16);

    expect(zip.readUInt32LE(directoryStart)).toBe(CENTRAL);
    expect(directoryStart + directorySize).toBe(end);
  });

  it("innehållet går att packa upp igen", () => {
    const text = "Efterkalkyl för order 1001. ".repeat(20);
    const zip = buildZip([file("order-1001.pdf", text)]);

    // Den lokala rubriken är 30 byte plus filnamn och extrafält.
    const nameLength = zip.readUInt16LE(26);
    const extraLength = zip.readUInt16LE(28);
    const start = 30 + nameLength + extraLength;
    const compressedLength = zip.readUInt32LE(18);

    const unpacked = inflateRawSync(
      zip.subarray(start, start + compressedLength)
    );

    expect(unpacked.toString("utf8")).toBe(text);
    expect(zip.subarray(30, 30 + nameLength).toString("utf8")).toBe(
      "order-1001.pdf"
    );
  });

  it("kontrollsumman stämmer med den kända för en känd sträng", () => {
    // Facit: CRC-32 av "123456789" är 0xCBF43926. Standardvärdet varje
    // implementation kontrolleras mot.
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("tomt arkiv är ett giltigt arkiv", () => {
    const zip = buildZip([]);

    expect(zip.length).toBe(22);
    expect(zip.readUInt32LE(0)).toBe(END);
  });
});

describe("filnamnen krockar inte", () => {
  it("två ordrar med samma nummer ger två filer", () => {
    const taken = new Set<string>();

    expect(uniqueName(taken, "order-1001", "pdf")).toBe("order-1001.pdf");
    expect(uniqueName(taken, "order-1001", "pdf")).toBe("order-1001-2.pdf");
    expect(uniqueName(taken, "order-1001", "pdf")).toBe("order-1001-3.pdf");
  });

  it("tecken som pekar utanför arkivet plockas bort", () => {
    const taken = new Set<string>();

    expect(uniqueName(taken, "../../etc/passwd", "pdf")).toBe(
      "etc-passwd.pdf"
    );
  });
});
