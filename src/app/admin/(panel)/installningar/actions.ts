"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { parseTimeOfDay } from "@/lib/time-zone";

/**
 * Företagstabellen har ingen company_id och ligger därför utanför det
 * filtrerande lagret. Varje åtgärd här begränsar istället uttryckligen till
 * det företag användaren är inloggad på.
 */

export async function saveCompany(formData: FormData) {
  const { companyId } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { name },
  });

  revalidatePath("/admin/installningar");
  revalidatePath("/admin");
}

/** Bildformat som fungerar både på skärm och i PDF. */
const LOGO_TYPES = ["image/png", "image/jpeg"];

/** 512 kB räcker gott för en logotyp och håller databasen liten. */
const LOGO_MAX_BYTES = 512 * 1024;

export interface LogoState {
  error?: string;
  ok?: string;
}

/**
 * Laddar upp en av kundens två logotyper.
 *
 * Två stycken eftersom en sällan fungerar på båda ställena: märket i ett hörn
 * vill vara fyrkantigt och fylla sin ruta, medan det på ett dokument vill vara
 * brett med namnet utskrivet. Att skala om den ena till den andra ger antingen
 * en tunn remsa med luft omkring eller ett beskuret namn.
 *
 * Bara PNG och JPEG. SVG hade varit snyggast på skärm men fungerar inte i
 * PDF-biblioteket, och en logotyp som syns i panelen men saknas på underlaget
 * till kundens kund är värre än ingen logotyp alls.
 */
export async function uploadLogo(
  _previous: LogoState,
  formData: FormData
): Promise<LogoState> {
  const { companyId } = await requireAdmin();

  const wide = String(formData.get("variant")) === "wide";
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Välj en bildfil." };
  }

  if (!LOGO_TYPES.includes(file.type)) {
    return { error: "Bilden måste vara PNG eller JPEG." };
  }

  if (file.size > LOGO_MAX_BYTES) {
    return {
      error: `Bilden är ${Math.round(file.size / 1024)} kB. Högsta storlek är 512 kB.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: wide
      ? {
          logoWideData: bytes,
          logoWideMimeType: file.type,
          logoUpdatedAt: new Date(),
        }
      : {
          logoSquareData: bytes,
          logoSquareMimeType: file.type,
          logoUpdatedAt: new Date(),
        },
  });

  revalidatePath("/admin", "layout");
  return {
    ok: wide
      ? "Logotypen för utskrifter är uppdaterad."
      : "Märket är uppdaterat.",
  };
}

export async function removeLogo(formData: FormData) {
  const { companyId } = await requireAdmin();
  const wide = String(formData.get("variant")) === "wide";

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: wide
      ? { logoWideData: null, logoWideMimeType: null }
      : { logoSquareData: null, logoSquareMimeType: null },
  });

  revalidatePath("/admin", "layout");
}

export async function saveTimeSettings(formData: FormData) {
  const { companyId } = await requireAdmin();

  const autoCloseAt = String(formData.get("autoCloseAt") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!autoCloseAt || !timezone) return;

  // Ett ogiltigt klockslag skulle få den automatiska utstämplingen att sluta
  // fungera tyst — inga fel, bara poster som aldrig stängs. Bättre att vägra.
  try {
    parseTimeOfDay(autoCloseAt);
    new Intl.DateTimeFormat("sv-SE", { timeZone: timezone });
  } catch {
    return;
  }

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { autoCloseAt, timezone },
  });

  revalidatePath("/admin/installningar/tider");
}

/**
 * Anonymiserar en anställd — GDPR:s "rätt att bli glömd".
 *
 * Vi RADERAR inte personen, och det är ett medvetet val. Registrerad tid är
 * underlag för fakturor, och fakturaunderlag måste enligt bokföringslagen
 * sparas i sju år. Raderade vi personen skulle underlaget bli obrukbart.
 *
 * Istället tas det som pekar ut individen bort: namnet ersätts med en
 * beteckning. Tiden finns kvar och går att fakturera, men går inte längre att
 * koppla till en namngiven person. Det är den tolkning som uppfyller båda
 * lagarna samtidigt.
 */
export async function anonymizeEmployee(formData: FormData) {
  const { db } = await requireAdmin();

  const id = String(formData.get("employeeId") ?? "");
  const confirmation = String(formData.get("confirm") ?? "").trim();
  if (!id) return;

  // Handlingen går inte att ångra. Att skriva ordet är en billig men effektiv
  // spärr mot ett felklick i en lista av namn.
  if (confirmation.toUpperCase() !== "ANONYMISERA") return;

  const employee = await db.employee.findFirst({ where: { id } });
  if (!employee) return;

  await db.employee.update({
    where: { id },
    data: {
      name: `Anonymiserad anställd (${employee.id.slice(-4)})`,
      active: false,

      // Porträttet är en personuppgift och en av de mest identifierande som
      // finns. Det raderas därför i samma steg som namnet — annars hade
      // anonymiseringen lämnat kvar ett ansikte.
      photoData: null,
      photoMimeType: null,
      photoUpdatedAt: new Date(),
    },
  });

  revalidatePath("/admin/installningar/dataskydd");
  revalidatePath("/admin/anstallda");
}
