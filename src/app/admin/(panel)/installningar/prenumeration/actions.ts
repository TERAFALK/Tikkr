"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { revalidatePath } from "next/cache";
import {
  applyLicenseChange,
  applyModuleChange,
  BillingChangeError,
  createCheckoutSession,
  createPortalSession,
  isPlatformManaged,
  platformManagedCompany,
  previewLicenseChange,
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

/**
 * Beskedet en fakturakund får i stället för att komma vidare.
 *
 * Samma text på båda ställena den behövs, så att svaret inte beror på vilken
 * knapp som trycktes.
 */
const MANAGED_NOTICE =
  "Prenumerationen sköts av Tikkr för det här företaget. Kontakta " +
  "support@tikkr.se för att ändra licenser eller tillval.";

export async function startCheckout(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);

  // SKÖTS FÖRETAGET AV OSS FINNS INGET ATT KÖPA HÄR. En kortprenumeration
  // ovanpå en faktura vi redan skickar betyder att kunden betalar två gånger,
  // och ingenting i systemet skulle säga ifrån. Grinden ligger i åtgärden och
  // inte bara i sidan: knappen är dold, men ett formulär kan skickas ändå.
  if (await platformManagedCompany(session.companyId)) {
    redirect("/admin/installningar/prenumeration?skots=1");
  }

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
  /** Ifylld när kunden ska bekräfta en ändring som kostar pengar. */
  preview?: {
    from: number;
    to: number;
    interval: "month" | "year";
    recurringAmount: number;
    currentAmount: number;
    nextInvoiceAmount: number | null;
    nextInvoiceAt: string | null;
  };
  error?: string;
  ok?: string;
}

/**
 * ÄNDRAR ANTALET LICENSER.
 *
 * Två steg, precis som tillvalen: först vad det kostar, sedan ändringen.
 * Beloppet i mellansteget kommer från Stripe.
 *
 * Ändringen görs här och inte på Stripes egen sida, eftersom ett tillval inte
 * går att lägga till där — kunden mötte annars två olika sätt att ändra samma
 * faktura beroende på vad de ändrade. Kort, kvitton och uppsägning ligger kvar
 * hos Stripe, se openBillingPortal nedan.
 */
export async function changeLicenses(
  _previous: LicenseFormState,
  formData: FormData
): Promise<LicenseFormState> {
  const session = await requireAdmin();
  await assertWritable(session);

  const screens = Number(formData.get("screens"));
  const step = String(formData.get("step") ?? "");

  // Avbryt är ett eget steg och inte en knapp som bara döljer rutan i
  // webbläsaren: tillståndet lever i åtgärden, och bara en ny körning av den
  // kan rensa det.
  if (step === "cancel") return {};

  try {
    if (step !== "apply") {
      const preview = await previewLicenseChange({
        companyId: session.companyId,
        screens,
      });

      return {
        preview: {
          from: preview.from,
          to: preview.to,
          interval: preview.interval,
          recurringAmount: preview.recurringAmount,
          currentAmount: preview.currentAmount,
          nextInvoiceAmount: preview.nextInvoiceAmount,
          nextInvoiceAt: preview.nextInvoiceAt?.toISOString() ?? null,
        },
      };
    }

    const quantity = await applyLicenseChange({
      companyId: session.companyId,
      screens,
    });

    revalidatePath("/admin/installningar/prenumeration");

    return {
      ok: `Antalet är ändrat till ${quantity} ${
        quantity === 1 ? "licens" : "licenser"
      }.`,
    };
  } catch (error) {
    if (error instanceof BillingChangeError) return { error: error.message };

    // Resten är driftfel. Orsaken hamnar i serverloggen med ett sökbart
    // prefix; kunden får ett svar de kan göra något med.
    console.error(
      "[licensändring] Ändringen gick inte igenom:",
      error instanceof Error ? error.message : error
    );

    return {
      error:
        "Ändringen gick inte igenom. Försök igen, eller kontakta support@tikkr.se om felet kvarstår.",
    };
  }
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
    select: { stripeSubscriptionId: true, subscriptionStatus: true },
  });

  // SKÖTS FÖRETAGET AV OSS BESTÄMMER VI, inte kunden.
  //
  // Reglaget nedan skriver bara en rad i company_modules och kostar därmed
  // ingenting. Det är rätt under provperioden och fel för en fakturakund: de
  // hade kunnat slå på planeringen för 699 kr i månaden utan att någonsin bli
  // debiterade. Tillvalen för dem sätts i plattformspanelen, där de hamnar i
  // händelseloggen med vem som gjorde det och varför.
  if (
    isPlatformManaged(
      company?.stripeSubscriptionId ?? null,
      company?.subscriptionStatus ?? "TRIALING"
    )
  ) {
    return { error: MANAGED_NOTICE };
  }

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
    if (error instanceof BillingChangeError) return { error: error.message };

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
