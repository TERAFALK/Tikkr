"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { hasModule, hasWorkHours } from "@/lib/company-modules";
import { parseOre } from "@/lib/money";
import { auditEmployeeChange, employeeBefore } from "@/lib/audit";
import { readScheduleDays, saveOwnScheduleDays } from "@/lib/schedule";
import { companyTimeZone } from "@/lib/company";
import { parseLocalDate, startOfDayIn } from "@/lib/time-zone";
import { unsafeGlobalPrisma } from "@/lib/db";
import { findAgreement } from "@/lib/collective-agreements";
import type { CompanyDb } from "@/lib/tenant";

// Varje åtgärd börjar med requireAdmin(). Det ger både inloggningskontroll och
// en databasklient låst till rätt företag — en serveråtgärd är en publik
// ingång till systemet och måste skydda sig själv.

const PATH = "/admin/anstallda";

/** Vad ett porträtt får vara. Samma gränser som för logotyperna. */
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PHOTO_MAX_BYTES = 512 * 1024;

export interface EmployeeState {
  error?: string;
  /**
   * Tidpunkten då sparandet lyckades.
   *
   * Ett värde som ändras vid varje lyckad sparning, så att rutan kan stänga
   * sig själv. En ren true-flagga hade inte gått: den ser likadan ut efter
   * andra sparningen som efter första, och rutan hade då inte stängts igen.
   */
  savedAt?: number;
}

/**
 * Läser bildfältet ur formuläret.
 *
 * Namn, nummer och bild ligger i SAMMA formulär, så att ett byte är en enda
 * handling. Ett separat bildformulär hade betytt ett extra steg att glömma —
 * och HTML tillåter inte formulär inuti formulär.
 *
 * Ger `undefined` när ingen fil valts, vilket betyder "rör inte bilden".
 */
async function readPhoto(
  formData: FormData
): Promise<
  // Uint8Array<ArrayBuffer> och inte bara Uint8Array. Utan typargumentet
  // antar TypeScript den bredare ArrayBufferLike, som rymmer SharedArrayBuffer
  // — och Prismas Bytes-fält godtar inte den. Värdet är redan rätt; det var
  // annoteringen som gjorde det bredare än det behövde vara.
  | { data: Uint8Array<ArrayBuffer>; mimeType: string }
  | undefined
  | { error: string }
> {
  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) return undefined;

  if (!PHOTO_TYPES.includes(file.type)) {
    return { error: "Bilden måste vara PNG, JPEG eller WebP." };
  }

  if (file.size > PHOTO_MAX_BYTES) {
    return {
      error: `Bilden är ${Math.round(file.size / 1024)} kB. Högsta storlek är 512 kB.`,
    };
  }

  // Uint8Array och inte Buffer: Prisma beskriver Bytes-fält som Uint8Array,
  // och Buffer räknas inte som exakt samma typ i ett create-anrop. Skillnaden
  // finns bara i typsystemet — innehållet är detsamma.
  return {
    data: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type,
  };
}

/** Tomt fält betyder inget nummer, vilket är något annat än numret "0". */
function readNumber(formData: FormData): string | null {
  const value = String(formData.get("employeeNumber") ?? "").trim();
  return value || null;
}

/**
 * Översätter databasens krockfel till något en människa förstår.
 *
 * Prisma svarar med koden P2002 när ett unikt värde redan finns. Det enda
 * unika på en anställd är anställningsnumret.
 */
function describeError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;

  if (code === "P2002") {
    return "Anställningsnumret används redan av en annan person.";
  }

  throw error;
}


/**
 * Fälten som ska skrivas för bilden.
 *
 * Byggs som en egen, uttryckligt typad variabel i stället för som en villkorlig
 * spridning direkt i data-objektet. En spridning av `villkor && { ... }` ger en
 * uniontyp som Prismas mycket strikta indatatyper vägrar ta emot — samma sorts
 * fel som gjorde att bygget stannade två gånger.
 *
 * Tomt objekt betyder "rör inte bilden".
 */
interface PhotoFields {
  photoData?: Uint8Array<ArrayBuffer> | null;
  photoMimeType?: string | null;
  photoUpdatedAt?: Date;
}

/**
 * Personens egna arbetstider, när företaget har lönemodulen.
 *
 * DELVIS GRINDAD FIL. Namn, nummer, bild och timkostnad hör till basen och
 * ska fungera för alla; bara arbetstiderna är ett tillval. Därför `hasModule`
 * kring just de raderna i stället för `requireModule` överst — en
 * anställdlista som svarar 404 för den som inte köpt löneunderlaget vore fel
 * sorts spärr. Se tests/module-coverage.test.ts.
 *
 * Inga dagsfält i formuläret betyder att personen ska gå på företagets
 * standardschema. Det är samma sak som att kryssa ur rutan, och därför
 * behöver gränssnittet inte skicka något extra för att säga det.
 *
 * Ger ett felmeddelande att visa, eller inget alls.
 */
/**
 * TIMANSTÄLLD: ingen planerad tid och inget flexsaldo.
 *
 * Krysset är bara läsbart med löneunderlaget. Utan modulen finns varken
 * schema eller flex att stänga av, och fältet ritas inte heller.
 */
function readHourly(formData: FormData, payroll: boolean): boolean {
  return payroll && formData.get("hourly") === "on";
}

/**
 * STARTDATUMET, dagen flexen börjar räknas (tillagt 2026-10-13).
 *
 * Lagras i `balanceOpeningDate`, som payroll.ts redan räknade från. Tomt fält
 * betyder första stämplingen, vilket är vad kolumnen alltid betytt när den är
 * tom.
 *
 * Fältet finns bara i rutan med löneunderlaget och utan krysset för
 * timanställd. Saknas det i formuläret rörs datumet inte, så att den som
 * kryssar i Timanställd och sedan ur igen inte tappar det.
 *
 * Sparas vid dygnets början i företagets tidszon. parseLocalDate landar
 * klockan 12, och förmiddagens stämplingar på startdagen ska räknas med.
 */
async function startDateFields(
  formData: FormData,
  companyId: string,
  payroll: boolean
): Promise<{ error: string } | { balanceOpeningDate?: Date | null }> {
  if (!payroll || !formData.has("startDate")) return {};

  const raw = String(formData.get("startDate") ?? "").trim();
  if (!raw) return { balanceOpeningDate: null };

  const timeZone = await companyTimeZone(companyId);
  const date = parseLocalDate(raw, timeZone);
  if (!date) return { error: "Startdatumet går inte att läsa." };

  return { balanceOpeningDate: startOfDayIn(date, timeZone) };
}

/**
 * ARBETSTIDSFORMEN FÖR ATF (tillagt 2026-10-13), till exempel dagtid eller
 * tvåskift. Prövas mot formerna i företagets avtal, så att en form som inte
 * finns där aldrig sparas.
 *
 * Saknas fältet i formuläret rörs värdet inte. Det visas bara med
 * löneunderlaget och ett valt avtal, och den som byter avtal fram och tillbaka
 * ska inte tappa formen på varje person.
 */
async function atfWorkFormFields(
  formData: FormData,
  companyId: string,
  payroll: boolean
): Promise<{ error: string } | { atfWorkForm?: string }> {
  if (!payroll || !formData.has("atfWorkForm")) return {};

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { atfAgreement: true },
  });
  const agreement = findAgreement(company?.atfAgreement);
  if (!agreement) return {};

  const key = String(formData.get("atfWorkForm") ?? "");
  if (!agreement.forms.some((form) => form.key === key)) {
    return { error: "Välj en arbetstidsform i listan." };
  }

  return { atfWorkForm: key };
}

async function saveSchedule(
  db: CompanyDb,
  companyId: string,
  employeeId: string,
  formData: FormData,
  payroll: boolean,
  workHours: boolean
): Promise<string | null> {
  // De egna tiderna finns med löneunderlaget eller planeringen, se
  // work-hours.ts. Timanställd är löneunderlagets kryss.
  if (!workHours) return null;

  // EN TIMANSTÄLLD HAR INGET SCHEMA ALLS, inte ens ett eget. Fälten göms i
  // rutan när krysset sätts, men ett formulär kan skickas av annat än
  // skärmen — och ett schema som ligger kvar hade mätt hen mot tider hen
  // inte lovat så fort krysset togs bort igen.
  if (readHourly(formData, payroll)) {
    await saveOwnScheduleDays(db, companyId, employeeId, []);
    return null;
  }

  const read = readScheduleDays(formData);
  if ("error" in read) return read.error;

  await saveOwnScheduleDays(db, companyId, employeeId, read.days);
  return null;
}

/**
 * Koden som låser upp det egna flexsaldot på stämplingsskärmen.
 *
 * Tomt fält betyder "rör inte koden", kryssrutan betyder "ta bort den". Samma
 * mönster som porträttet ovan, och av samma skäl: den som sparar namnet ska
 * inte råka nollställa något annat.
 *
 * Hashas med bcrypt. En fyrsiffrig kod är inget lösenord, men den är en kod
 * folk återanvänder, och en sådan ska inte ligga i klartext i en databas.
 *
 * Ger ett felmeddelande att visa, eller fälten att skriva.
 */
async function flexCodeFields(
  formData: FormData,
  payroll: boolean
): Promise<{ error: string } | { flexCodeHash?: string | null }> {
  // Utan lönemodulen finns ingen kod att sätta, och rutan visar inget fält.
  if (!payroll) return {};

  if (formData.get("removeFlexCode") === "on") return { flexCodeHash: null };

  const code = String(formData.get("flexCode") ?? "").trim();
  if (!code) return {};

  if (!/^\d{4,8}$/.test(code)) {
    return { error: "Koden ska vara 4 till 8 siffror." };
  }

  return { flexCodeHash: await bcrypt.hash(code, 12) };
}

function photoFields(
  photo: { data: Uint8Array<ArrayBuffer>; mimeType: string } | undefined,
  remove: boolean
): PhotoFields {
  if (photo) {
    return {
      photoData: photo.data,
      photoMimeType: photo.mimeType,
      photoUpdatedAt: new Date(),
    };
  }

  if (remove) {
    return { photoData: null, photoMimeType: null, photoUpdatedAt: new Date() };
  }

  return {};
}

export async function createEmployee(
  _previous: EmployeeState,
  formData: FormData
): Promise<EmployeeState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ange ett namn." };

  const photo = await readPhoto(formData);
  if (photo && "error" in photo) return { error: photo.error };

  const payroll = await hasModule(companyId, "PAYROLL");
  const workHours = await hasWorkHours(companyId);

  const flexCode = await flexCodeFields(formData, payroll);
  if ("error" in flexCode) return { error: flexCode.error };

  const startDate = await startDateFields(formData, companyId, payroll);
  if ("error" in startDate) return { error: startDate.error };

  const atfWorkForm = await atfWorkFormFields(formData, companyId, payroll);
  if ("error" in atfWorkForm) return { error: atfWorkForm.error };

  let created: { id: string };

  try {
    created = await db.employee.create({
      data: {
        name,
        companyId,
        employeeNumber: readNumber(formData),
        costRateOre: parseOre(formData.get("costRate")),
        hourly: readHourly(formData, payroll),
        ...photoFields(photo, false),
        ...flexCode,
        ...startDate,
        ...atfWorkForm,
      },
      select: { id: true },
    });
  } catch (error) {
    return { error: describeError(error) };
  }

  // Efter personen och inte i samma anrop: schemat pekar på den anställda,
  // som får sitt id först när raden finns.
  const scheduleError = await saveSchedule(
    db,
    companyId,
    created.id,
    formData,
    payroll,
    workHours
  );
  if (scheduleError) return { error: scheduleError };

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

/**
 * Ändrar namn, nummer och bild i ett svep.
 *
 * Bilden rörs bara när en ny fil valts, eller när rutan för att ta bort den
 * kryssats i. Att spara utan att välja något ska inte radera porträttet.
 */
export async function updateEmployee(
  _previous: EmployeeState,
  formData: FormData
): Promise<EmployeeState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!id) return { error: "Okänd person." };
  if (!name) return { error: "Ange ett namn." };

  const photo = await readPhoto(formData);
  if (photo && "error" in photo) return { error: photo.error };

  const removePhoto = formData.get("removePhoto") === "on";

  const payroll = await hasModule(companyId, "PAYROLL");
  const workHours = await hasWorkHours(companyId);

  const flexCode = await flexCodeFields(formData, payroll);
  if ("error" in flexCode) return { error: flexCode.error };

  const startDate = await startDateFields(formData, companyId, payroll);
  if ("error" in startDate) return { error: startDate.error };

  const atfWorkForm = await atfWorkFormFields(formData, companyId, payroll);
  if ("error" in atfWorkForm) return { error: atfWorkForm.error };

  // Timkostnaden följer med varje ny stämpling. En ändring av den ska gå att
  // spåra, se audit.ts.
  const before = await employeeBefore(db, id);

  try {
    // updateMany och inte update: id:t kommer från formuläret och får aldrig
    // kunna peka på en annan kunds anställd. Företagsfiltret ser till att en
    // träff utanför det egna företaget ger noll rader i stället för en ändring.
    await db.employee.updateMany({
      where: { id },
      data: {
        name,
        employeeNumber: readNumber(formData),
        costRateOre: parseOre(formData.get("costRate")),
        hourly: readHourly(formData, payroll),
        ...photoFields(photo, removePhoto),
        ...flexCode,
        ...startDate,
        ...atfWorkForm,
      },
    });
  } catch (error) {
    return { error: describeError(error) };
  }

  if (before) {
    await auditEmployeeChange(db, {
      employeeId: id,
      actorEmail: session.email,
      before,
    });
  }

  const scheduleError = await saveSchedule(
    db,
    companyId,
    id,
    formData,
    payroll,
    workHours
  );
  if (scheduleError) return { error: scheduleError };

  revalidatePath(PATH);
  // Planerad tid ändras, och den räknas fram på tidrapporten.
  revalidatePath("/admin/tidrapport");
  return { savedAt: Date.now() };
}

/**
 * Avaktiverar eller återaktiverar en anställd.
 *
 * Vi raderar aldrig här. En anställd som slutat har registrerad tid på ordrar
 * som ska faktureras — försvinner personen försvinner underlaget. Avaktiverad
 * betyder "visas inte längre på stämplingsskärmen", inget mer.
 *
 * Riktig radering finns i inställningarna, för GDPR-fallet.
 */
export async function toggleEmployee(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const before = await employeeBefore(db, id);
  if (!before) return;

  await db.employee.updateMany({ where: { id }, data: { active: !active } });
  await auditEmployeeChange(db, { employeeId: id, actorEmail: session.email, before });

  revalidatePath(PATH);
}
