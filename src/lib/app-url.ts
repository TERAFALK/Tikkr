/**
 * SYSTEMETS EGEN ADRESS, för länkar som lämnar servern.
 *
 * Återställningslänkar, inbjudningar och Stripes återvägar byggdes tidigare ur
 * anropets `x-forwarded-host`. Den raden skickas av webbläsaren, och proxyn
 * släpper igenom den orörd. Den som begärde en återställning åt någon annan med
 * `X-Forwarded-Host: angripare.se` fick därmed ett äkta mejl från
 * noreply@tikkr.se skickat till offret, med en länk till sin egen server. Ett
 * klick, och token var deras.
 *
 * Adressen är därför en INSTÄLLNING och aldrig något anropet får påverka:
 *
 *   APP_URL=https://www.tikkr.se     (labbet, och tills portalen finns)
 *   APP_URL=https://portal.tikkr.se  (produktion)
 *
 * Saknas APP_URL men PORTAL_HOST är satt används den. Saknas båda finns ingen
 * adress att lita på, och då byggs ingen länk alls — ett mejl som inte går ut
 * är ett driftfel som syns i loggen, en länk till fel värd är ett kapat konto.
 *
 * Ingen import, så att funktionen går att testa utan att starta en app.
 */

export class AppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppUrlError";
  }
}

interface AppUrlEnv {
  APP_URL?: string;
  PORTAL_HOST?: string;
  NODE_ENV?: string;
}

/**
 * Adressen ur miljön, eller null när den inte går att avgöra.
 *
 * Bara schema och värd behålls. En avslutande snedstreck eller en sökväg i
 * inställningen hade gett "https://www.tikkr.se//admin/…".
 */
export function resolveAppUrl(env: AppUrlEnv): string | null {
  const configured = env.APP_URL?.trim();

  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      return null;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    return `${url.protocol}//${url.host}`;
  }

  const portal = env.PORTAL_HOST?.trim().toLowerCase();
  if (portal) return `https://${portal}`;

  // `next dev` på en utvecklares dator. Aldrig i en byggd image, där
  // NODE_ENV alltid är production.
  if (env.NODE_ENV === "development") return "http://localhost:3000";

  return null;
}

/** Adressen, eller ett fel som säger vad som ska sättas. */
export function appUrl(): string {
  const url = resolveAppUrl(process.env);

  if (!url) {
    throw new AppUrlError(
      "APP_URL saknas eller är ogiltig i .env. Sätt den till systemets " +
        "adress, t.ex. APP_URL=https://www.tikkr.se, och starta om appen."
    );
  }

  return url;
}
