import { headers } from "next/headers";

/**
 * VILKEN IP-ADRESS ANROPET KOM IFRÅN.
 *
 * Används till två saker som båda förutsätter att svaret inte går att
 * förfalska: spärren mot gissning av kopplingskoder och lösenord, och IP-fältet
 * i stämplingarnas audit-logg.
 *
 * Tidigare togs FÖRSTA värdet i X-Forwarded-For. Det värdet skriver klienten
 * själv: proxyn lägger till den riktiga adressen SIST i raden och lämnar resten
 * orörd. Den som bytte header vid varje anrop fick därför ett nytt försök varje
 * gång, och spärren mot kopplingskoderna var verkningslös — och IP:n i
 * audit-loggen var vad angriparen ville att den skulle vara.
 *
 * Nu gäller SISTA värdet, alltså det vår egen proxy satte:
 *
 *   Nginx Proxy Manager  lägger till $remote_addr sist ($proxy_add_x_forwarded_for)
 *   Caddy                ersätter raden med klientens adress
 *
 * Båda ger rätt svar med samma regel. Förutsättningen är att appen BARA nås
 * via proxyn (APP_BIND=127.0.0.1) — nås porten direkt finns ingen proxy som
 * skrivit något, och då är varje header klientens egen.
 */

interface HeaderSource {
  get(name: string): string | null;
}

/** Adressen ur en uppsättning headers. Ren logik, för testerna. */
export function clientIpFrom(source: HeaderSource): string | undefined {
  const forwarded = source.get("x-forwarded-for");

  if (forwarded) {
    const last = forwarded.split(",").map((part) => part.trim()).filter(Boolean).pop();
    if (last) return last;
  }

  return source.get("x-real-ip")?.trim() || undefined;
}

/** Adressen för det pågående anropet, i serveråtgärder och sidor. */
export async function requestIp(): Promise<string | undefined> {
  return clientIpFrom(await headers());
}
