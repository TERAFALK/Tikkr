/**
 * Säljsidans riktiga adress.
 *
 * Används för sökmotorernas skull: kanonisk länk, sitemap och robots. Utan en
 * bestämd adress kan `tikkr.se` och `www.tikkr.se` uppfattas som två olika
 * sidor med samma innehåll, vilket delar upp deras värde på båda.
 *
 * Första adressen i MARKETING_HOST är den som gäller. Saknas variabeln finns
 * ingen publik adress att peka ut, och då lämnar vi det osagt istället för att
 * gissa fel.
 */
export function siteUrl(): string | null {
  const first = (process.env.MARKETING_HOST ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)[0];

  return first ? `https://${first}` : null;
}

/**
 * Hjälpcentrets riktiga adress.
 *
 * support.tikkr.se när SUPPORT_HOST är satt, annars säljsidans adress, där
 * hjälpcentret då ligger under /hjalp. Används för den kanoniska länken och
 * sitemap, så att en guide som nås på två adresser räknas som en sida.
 */
export function helpSiteUrl(): string | null {
  const host = process.env.SUPPORT_HOST?.trim();
  return host ? `https://${host}` : siteUrl();
}
