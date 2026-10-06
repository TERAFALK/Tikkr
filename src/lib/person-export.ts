import ExcelJS from "exceljs";
import type { CompanyDb } from "./tenant";
import { describeEntry } from "./entry-label";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatSignedDuration,
  minutesBetween,
} from "./format";
import { formatCurrency } from "./money";
import { describeAuditEvents } from "./audit-view";
import { buildZip, type ZipEntry } from "./zip";

/**
 * REGISTERUTDRAG FÖR EN ANSTÄLLD (infört 2026-10-06).
 *
 * Den som är registrerad har rätt att få veta allt som finns om hen.
 * Integritetspolicyn lovar att administratören kan "ta fram samtliga
 * registrerade uppgifter om en person och lämna ut dem som fil", och vägen dit
 * var rapportens Excel-ark — som bara innehöll stämplingarna. Frånvaron,
 * rasterna, komptiden, saldona, porträttet och ändringarna fanns inte med.
 *
 * Utdraget är ett zip-arkiv: ett Excel-ark med en flik per register, och
 * porträttet som egen fil när det finns. Bilden ligger i arkivet och inte i
 * arket, eftersom arket inte kan visa alla format en bild kan ha.
 *
 * LÖNEUNDERLAGETS REGISTER TAS MED OAVSETT TILLVALET. Att stänga av modulen
 * raderar ingenting, och uppgifter som finns ska lämnas ut — samma undantag
 * som anonymiseringen har, se CLAUDE.md § 3.1. En flik visas bara när den har
 * något innehåll.
 *
 * Läses från den här filen och inte från en rutt, så att räkningen går att
 * testa. Allt går genom den företagslåsta klienten: en anställd hos ett annat
 * företag ger ingenting.
 */

export interface PersonExport {
  fileName: string;
  data: Buffer;
}

const SOURCE_LABELS: Record<string, string> = {
  KIOSK: "Stämplingsskärm",
  KIOSK_OFFLINE_SYNC: "Stämplingsskärm, skickad senare",
  ADMIN_MANUAL: "Inskriven av administratör",
  AUTO_CLOSE: "Automatisk utstämpling",
};

const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Utdraget, eller null när personen inte finns hos företaget. */
export async function buildPersonExport(
  db: CompanyDb,
  employeeId: string,
  timeZone: string
): Promise<PersonExport | null> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    include: { schedule: { select: { name: true } } },
  });

  if (!employee) return null;

  const [entries, breaks, absences, comp, events] = await Promise.all([
    db.timeEntry.findMany({
      where: { employeeId },
      orderBy: { clockInAt: "asc" },
      include: {
        order: { select: { orderNumber: true, customer: { select: { name: true } } } },
        moment: { select: { name: true } },
        indirectMoment: { select: { name: true } },
        kioskDevice: { select: { name: true } },
      },
    }),
    db.breakEntry.findMany({
      where: { employeeId },
      orderBy: { startedAt: "asc" },
      include: { breakType: { select: { name: true } } },
    }),
    db.absence.findMany({
      where: { employeeId },
      orderBy: { date: "asc" },
      include: { reason: { select: { name: true } } },
    }),
    db.compAdjustment.findMany({
      where: { employeeId },
      orderBy: { date: "asc" },
    }),
    db.auditEvent.findMany({
      where: { subjectEmployeeId: employeeId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tikkr";
  workbook.created = new Date();

  /* --- Uppgifter om personen ---------------------------------------------- */

  const person = workbook.addWorksheet("Uppgifter");
  person.columns = [
    { header: "Uppgift", key: "label", width: 30 },
    { header: "Värde", key: "value", width: 40 },
  ];

  const photoExtension = employee.photoMimeType
    ? PHOTO_EXTENSIONS[employee.photoMimeType]
    : undefined;

  const facts: [string, string][] = [
    ["Namn", employee.name],
    ["Anställningsnummer", employee.employeeNumber ?? ""],
    ["Aktiv", employee.active ? "Ja" : "Nej"],
    ["Upplagd", formatDateTime(employee.createdAt, timeZone)],
    [
      "Timkostnad",
      employee.costRateOre === null
        ? ""
        : `${formatCurrency(employee.costRateOre)}/tim`,
    ],
    ["Porträtt", employee.photoData && photoExtension ? "Bifogat i arkivet" : "Inget"],
    ["Arbetstidsschema", employee.schedule ? "Eget schema" : "Företagets"],
    ["Ingående flexsaldo", formatSignedDuration(employee.flexOpeningMinutes)],
    ["Ingående komptid", formatSignedDuration(employee.compOpeningMinutes)],
    [
      "Saldon räknas från",
      employee.balanceOpeningDate
        ? formatDate(employee.balanceOpeningDate, timeZone)
        : "Första stämplingen",
    ],
    // Själva koden går inte att lämna ut: den lagras bara som envägskryptering.
    ["Personlig kod för flexsaldot", employee.flexCodeHash ? "Satt" : "Inte satt"],
  ];

  for (const [label, value] of facts) person.addRow({ label, value });

  /* --- Stämplingar ---------------------------------------------------------- */

  const punches = workbook.addWorksheet("Stämplingar");
  punches.columns = [
    { header: "Instämplad", key: "in", width: 18 },
    { header: "Utstämplad", key: "out", width: 18 },
    // Bara tim:min. Utdraget är till för att LÄSAS av den som begärt det, inte
    // för att räkna vidare i — därför ingen decimalkolumn, till skillnad från
    // rapportens ark. Se tests/format.test.ts.
    { header: "Tid (tim:min)", key: "duration", width: 14 },
    { header: "Jobb", key: "job", width: 32 },
    { header: "Kund", key: "customer", width: 24 },
    { header: "Källa", key: "source", width: 28 },
    { header: "Skärm", key: "device", width: 20 },
    { header: "IP-adress", key: "ip", width: 16 },
    { header: "Granskning", key: "review", width: 48 },
  ];

  for (const entry of entries) {
    const minutes = minutesBetween(entry.clockInAt, entry.clockOutAt);

    punches.addRow({
      in: formatDateTime(entry.clockInAt, timeZone),
      out: entry.clockOutAt ? formatDateTime(entry.clockOutAt, timeZone) : "Pågår",
      duration: formatDuration(minutes),
      job: describeEntry(entry).text,
      customer: entry.order?.customer?.name ?? "",
      source: SOURCE_LABELS[entry.source] ?? entry.source,
      device: entry.kioskDevice?.name ?? "",
      ip: entry.sourceIp ?? "",
      review: [entry.needsReview ? "Ogranskad." : "", entry.reviewNote ?? ""]
        .filter(Boolean)
        .join(" "),
    });
  }

  /* --- Löneunderlagets register, när de har innehåll ------------------------ */

  if (breaks.length > 0) {
    const sheet = workbook.addWorksheet("Raster");
    sheet.columns = [
      { header: "Rast", key: "type", width: 16 },
      { header: "Började", key: "start", width: 18 },
      { header: "Slutade", key: "end", width: 18 },
      { header: "Tid (tim:min)", key: "duration", width: 14 },
      { header: "Källa", key: "source", width: 28 },
    ];

    for (const row of breaks) {
      sheet.addRow({
        type: row.breakType.name,
        start: formatDateTime(row.startedAt, timeZone),
        end: row.endedAt ? formatDateTime(row.endedAt, timeZone) : "Pågår",
        duration: formatDuration(minutesBetween(row.startedAt, row.endedAt)),
        source: SOURCE_LABELS[row.source] ?? row.source,
      });
    }
  }

  if (absences.length > 0) {
    const sheet = workbook.addWorksheet("Frånvaro");
    sheet.columns = [
      { header: "Datum", key: "date", width: 12 },
      { header: "Orsak", key: "reason", width: 20 },
      { header: "Tid (tim:min)", key: "duration", width: 14 },
      { header: "Anteckning", key: "note", width: 40 },
      { header: "Registrerad av", key: "by", width: 28 },
    ];

    for (const row of absences) {
      sheet.addRow({
        date: formatDate(row.date, timeZone),
        reason: row.reason.name,
        duration: row.minutes === null ? "Hela dagen" : formatDuration(row.minutes),
        note: row.note ?? "",
        by: row.createdByEmail,
      });
    }
  }

  if (comp.length > 0) {
    const sheet = workbook.addWorksheet("Komptid");
    sheet.columns = [
      { header: "Datum", key: "date", width: 12 },
      { header: "Tid (tim:min)", key: "duration", width: 14 },
      { header: "Anteckning", key: "note", width: 40 },
      { header: "Registrerad av", key: "by", width: 28 },
    ];

    for (const row of comp) {
      sheet.addRow({
        date: formatDate(row.date, timeZone),
        duration: formatSignedDuration(row.minutes),
        note: row.note ?? "",
        by: row.createdByEmail,
      });
    }
  }

  /* --- Ändringar ------------------------------------------------------------ */

  if (events.length > 0) {
    const sheet = workbook.addWorksheet("Ändringar");
    sheet.columns = [
      { header: "När", key: "at", width: 18 },
      { header: "Vem", key: "actor", width: 28 },
      { header: "Vad", key: "what", width: 36 },
      { header: "Ändring", key: "change", width: 60 },
    ];

    for (const row of await describeAuditEvents(db, events, timeZone)) {
      sheet.addRow({
        at: row.at,
        actor: row.actor,
        what: row.what,
        change: row.changes
          .map((change) => `${change.label}: ${change.before} → ${change.after}`)
          .join("; "),
      });
    }
  }

  for (const sheet of workbook.worksheets) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  /* --- Arkivet --------------------------------------------------------------- */

  const files: ZipEntry[] = [
    {
      name: "registerutdrag.xlsx",
      data: Buffer.from(await workbook.xlsx.writeBuffer()),
    },
  ];

  if (employee.photoData && photoExtension) {
    files.push({
      name: `portratt.${photoExtension}`,
      data: Buffer.from(employee.photoData),
    });
  }

  const slug =
    employee.name
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "anstalld";

  return {
    fileName: `registerutdrag-${slug}-${formatDate(new Date(), timeZone)}.zip`,
    data: buildZip(files),
  };
}
