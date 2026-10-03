import { CONTACT, hasBooking, hasPhone } from "@/lib/contact";

/**
 * VÄGEN TILL EN MÄNNISKA, SOM EN RAD.
 *
 * Står där beslutet fattas: vid priset och vid den avslutande uppmaningen. Den
 * som ska införa ett system i sin produktion vill ofta tala med någon innan,
 * och fick tidigare leta efter en supportadress i foten.
 *
 * EN RAD OCH INGEN RUTA. Ett kontaktblock med rubrik och ikon hade konkurrerat
 * med knappen bredvid, och knappen är fortfarande det vi vill att de trycker
 * på. Den här raden finns för den som inte vill det.
 *
 * Språket följer § 7.1: inga tilltal, ingen uppmaning att inte tveka. Numret
 * och vad det är räcker.
 *
 * Renderar ingenting alls när `contact.ts` är tom, vilket den är tills
 * numret är bestämt.
 */
export default function ContactLine({
  tone = "light",
  size = "sm",
  className = "",
}: {
  /** Vilken yta raden ligger på. Styr bara färgen. */
  tone?: "light" | "dark" | "tick";
  /** Foten är satt en halv storlek mindre än resten av sidan. */
  size?: "sm" | "xs";
  className?: string;
}) {
  const phone = hasPhone();
  const booking = hasBooking();

  if (!phone && !booking) return null;

  const text =
    tone === "dark"
      ? "text-neutral-400"
      : tone === "tick"
        ? "text-emerald-900"
        : "text-neutral-500";

  const link =
    tone === "dark"
      ? "text-white hover:text-tick"
      : tone === "tick"
        ? "text-neutral-900 hover:underline"
        : "text-tick-deep hover:underline";

  return (
    <p
      className={`${size === "xs" ? "text-xs" : "text-[13px]"} ${text} ${className}`}
    >
      {phone && (
        <>
          Ring{" "}
          <a href={`tel:${CONTACT.phoneHref}`} className={`font-medium ${link}`}>
            {CONTACT.phone}
          </a>
        </>
      )}
      {phone && booking && " eller "}
      {booking && (
        <a
          href={CONTACT.bookingUrl}
          className={`font-medium ${link}`}
          target="_blank"
          rel="noreferrer"
        >
          boka en genomgång
        </a>
      )}
      {"."}
    </p>
  );
}
