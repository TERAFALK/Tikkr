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
