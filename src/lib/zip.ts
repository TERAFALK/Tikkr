import { deflateRawSync } from "node:zlib";

/**
 * EN LITEN ZIP-SKRIVARE.
 *
 * Finns för att flera markerade ordrar ska bli EN FIL PER ORDER i stället för
 * ett dokument med en sida per order. Den som fakturerar tio ordrar bifogar
 * tio underlag till tio fakturor, och att klippa isär en PDF i efterhand är
 * inte ett arbete ett system ska lämna kvar åt någon.
 *
 * Egen kod och inget bibliotek. Formatet som behövs här är den ursprungliga
 * ZIP-filen: en lokal rubrik per fil, en central katalog sist. Inga mappar,
 * inga stora filer, ingen kryptering. Det är sextio rader, och alternativet
 * vore ett beroende till som ska hållas uppdaterat för en funktion som aldrig
 * kommer att ändras — formatet är från 1989 och ligger still.
 *
 * ZIP64 finns INTE här. Gränsen går vid fyra gigabyte per fil och 65 535
 * filer, och en orderexport når aldrig i närheten. Skulle den göra det är en
 * trasig fil värre än ett fel, och därför kontrolleras båda gränserna.
 */

export interface ZipEntry {
  /** Filnamnet i arkivet. Ren ASCII, inga mappar. */
  name: string;
  data: Buffer;
}

/** Antalet filer ett arkiv får innehålla utan ZIP64. */
const MAX_ENTRIES = 0xffff;

/** Största storlek en fil får ha utan ZIP64. */
const MAX_BYTES = 0xffffffff;

export function buildZip(entries: ZipEntry[]): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error("För många filer i arkivet.");
  }

  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);

    // Deflate, inte lagring. En PDF är redan komprimerad och krymper knappt,
    // men Excel-filer och framtida textbilagor gör det — och en zip där allt
    // ligger okomprimerat ser ut som ett misstag för den som öppnar den.
    const compressed = deflateRawSync(entry.data);

    if (entry.data.length > MAX_BYTES || compressed.length > MAX_BYTES) {
      throw new Error("Filen är för stor för arkivet.");
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signatur
    local.writeUInt16LE(20, 4); // version som krävs
    local.writeUInt16LE(0x0800, 6); // flagga: filnamnet är UTF-8
    local.writeUInt16LE(8, 8); // metod: deflate
    local.writeUInt16LE(0, 10); // ändringstid
    local.writeUInt16LE(0x21, 12); // ändringsdatum, 1 januari 1996
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extrafält

    locals.push(local, name, compressed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); // signatur
    header.writeUInt16LE(20, 4); // version som skrev filen
    header.writeUInt16LE(20, 6); // version som krävs
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30); // extrafält
    header.writeUInt16LE(0, 32); // kommentar
    header.writeUInt16LE(0, 34); // disknummer
    header.writeUInt16LE(0, 36); // interna attribut
    header.writeUInt32LE(0, 38); // externa attribut
    header.writeUInt32LE(offset, 42);

    central.push(header, name);

    offset += local.length + name.length + compressed.length;
  }

  const directory = Buffer.concat(central);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // signatur
  end.writeUInt16LE(0, 4); // disknummer
  end.writeUInt16LE(0, 6); // disken där katalogen börjar
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // kommentar

  return Buffer.concat([...locals, directory, end]);
}

/**
 * Tabellen för CRC-32.
 *
 * Räknas fram en gång vid start i stället för att skrivas av som 256 tal.
 * Node har en inbyggd `zlib.crc32` sedan version 20, men den saknas i äldre
 * körningar, och en zip med fel kontrollsumma öppnas inte alls.
 */
const TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let value = i;

    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }

    table[i] = value >>> 0;
  }

  return table;
})();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Ett filnamn som fungerar i ett arkiv.
 *
 * Tar bort det som skulle kunna peka utanför arkivet, och ser till att två
 * ordrar med samma nummer inte skriver över varandra. En order som råkar heta
 * samma sak som en annan ska ge två filer, inte en.
 */
export function uniqueName(
  taken: Set<string>,
  base: string,
  extension: string
): string {
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+/, "") || "fil";

  let name = `${safe}.${extension}`;
  let counter = 2;

  while (taken.has(name)) {
    name = `${safe}-${counter}.${extension}`;
    counter++;
  }

  taken.add(name);
  return name;
}
