"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { revalidatePath } from "next/cache";
import {
  applyModuleChange,
  createCheckoutSession,
  createPortalSession,
  ModuleChangeError,
  openLicenseUpdate,
  previewModuleChange,
} from "@/lib/billing";
import { setModuleManually } from "@/lib/company-modules";
import { isModuleKey, moduleName } from "@/lib/modules";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * Adressen byggs ur anropet istället för att gissas, så att Stripe skickar
 * tillbaka kunden dit den faktiskt kom ifrån — labbadress, portal.tikkr.se
 * eller något annat.
 */
async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function startCheckout(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);

  const url = await createCheckoutSession({
    companyId: session.companyId,
    companyName: session.companyName,
    email: session.email,
    baseUrl: await baseUrl(),
    interval: String(formData.get("interval")) === "year" ? "year" : "month",
    screens: Number(formData.get("screens")) || 1,
  });

  redirect(url);
}

export interface LicenseFormState {
  error?: string;
}

/**
 * Skickar vidare till Stripe, där antalet licenser ändras.
 *
 * Formuläret stannar kvar vid fel, så att orsaken går att läsa. Ett fel här är
 * nästan alltid en driftsak — Stripe svarar inte, eller saknar den
 * portalkonfiguration som krävs — och detaljerna hamnar i serverloggen.
 */
export async function changeLicenses(
  _previous: LicenseFormState
): Promise<LicenseFormState> {
  const session = await requireAdmin();
  await assertWritable(session);

  let url: string;

  try {
    url = await openLicenseUpdate({
      companyId: session.companyId,
      baseUrl: await baseUrl(),
    });
  } catch (error) {
    // Felet skrivs ut i klartext och med ett sökbart prefix. Det som går fel
    // här är nästan alltid en inställning hos betaltjänsten, och då behöver
    // den som sköter driften kunna läsa orsaken utan att gissa.
    console.error(
      "[licensändring] Kunde inte öppna betaltjänstens sida:",
      error instanceof Error ? error.message : error
    );

    return {
      error:
        "Sidan för att ändra antalet kunde inte öppnas. Försök igen, eller kontakta support@tikkr.se om felet kvarstår.",
    };
  }

  // Ligger utanför try-blocket. redirect() avbryter genom att kasta, och hade
  // fångats som ett fel om den låg innanför.
  redirect(url);
}

export async function openBillingPortal() {
  const session = await requireAdmin();
  await assertWritable(session);

  const url = await createPortalSession({
    companyId: session.companyId,
    baseUrl: await baseUrl(),
  });

  redirect(url);
}

/* -------------------------------------------------------------------------- */
/* Tillval                                                                     */
/* -------------------------------------------------------------------------- */

export interface ModuleFormState {
  /** Ifylld när kunden ska bekräfta en ändring som kostar pengar. */
  preview?: {
    key: string;
    name: string;
    on: boolean;
    interval: "month" | "year";
    recurringAmount: number;
    nextInvoiceAmount: number | null;
    nextInvoiceAt: string | null;
  };
  error?: string;
  ok?: string;
}

/**
 * SLÅR PÅ ELLER AV ETT TILLVAL.
 *
 * Tre vägar, och skillnaden mellan dem är om det kostar något:
 *
 * 1. Ingen prenumeration — provperiod eller fakturakund. Reglaget skriver
 *    raden direkt. Det är samma knapp kunden kommer att möta senare, men
 *    under provperioden är den gratis.
 * 2. Prenumeration, steg "preview". Vi frågar Stripe vad ändringen kostar
 *    och visar svaret. Ingenting har hänt än.
 * 3. Prenumeration, steg "apply". Ändringen görs hos Stripe.
 *
 * Att dela upp det i två steg är hela poängen: en kryssruta som tyst ändrar
 * en faktura är inte ett val kunden gjort medvetet.
 */
export async function changeModule(
  _previous: ModuleFormState,
  formData: FormData
): Promise<ModuleFormState> {
  const session = await requireAdmin();
  await assertWritable(session);

  const key = String(formData.get("module") ?? "");
  const on = String(formData.get("on") ?? "") === "1";
  const step = String(formData.get("step") ?? "");

  // Avbryt är ett eget steg och inte en knapp som bara döljer rutan i
  // webbläsaren: tillståndet lever i åtgärden, och bara en ny körning av den
  // kan rensa det.
  if (step === "cancel") return {};

  const apply = step === "apply";

  if (!isModuleKey(key)) return { error: "Okänt tillval." };

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: session.companyId },
    select: { stripeSubscriptionId: true },
  });

  // Utan prenumeration kostar reglaget ingenting, och då finns inget att
  // bekräfta. Kunden trycker en gång och är klar.
  if (!company?.stripeSubscriptionId) {
    await setModuleManually({
      companyId: session.companyId,
      key,
      on,
      actorEmail: session.email,
    });

    revalidatePath("/admin", "layout");

    return {
      ok: on
        ? `${moduleName(key)} är påslaget.`
        : `${moduleName(key)} är avstängt.`,
    };
  }

  try {
    if (!apply) {
      const preview = await previewModuleChange({
        companyId: session.companyId,
        key,
        on,
      });

      return {
        preview: {
          key: preview.key,
          name: preview.name,
          on: preview.on,
          interval: preview.interval,
          recurringAmount: preview.recurringAmount,
          nextInvoiceAmount: preview.nextInvoiceAmount,
          nextInvoiceAt: preview.nextInvoiceAt?.toISOString() ?? null,
        },
      };
    }

    await applyModuleChange({ companyId: session.companyId, key, on });
  } catch (error) {
    if (error instanceof ModuleChangeError) return { error: error.message };

    // Resten är driftfel — Stripe svarar inte, eller en artikel saknas.
    // Orsaken hamnar i serverloggen med ett sökbart prefix; kunden får ett
    // svar de kan göra något med.
    console.error(
      "[tillval] Ändringen gick inte igenom:",
      error instanceof Error ? error.message : error
    );

    return {
      error:
        "Ändringen gick inte igenom. Försök igen, eller kontakta support@tikkr.se om felet kvarstår.",
    };
  }

  // Hela panelen ritas om: menyn visar eller döljer modulens sidor.
  revalidatePath("/admin", "layout");

  return {
    ok: on
      ? `${moduleName(key)} är påslaget.`
      : `${moduleName(key)} är avstängt.`,
  };
}
