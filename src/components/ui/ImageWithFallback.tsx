"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * EN BILD SOM VISAR SIN RESERV NÄR DEN INTE GÅR ATT HÄMTA.
 *
 * Porträtten och logotypen hämtas från adresser bakom skärmens inloggning.
 * Utan nät, och utan sparad kopia, svarade de med ett fel, och webbläsaren
 * ritade då en tom vit ruta. Det såg ut som att personen hade ett vitt foto,
 * inte som att bilden saknades. Initialerna är rätt besked: samma som för den
 * som aldrig haft något foto.
 *
 * En egen klientkomponent, så att EmployeeAvatar och CompanyBadge kan förbli
 * vanliga komponenter. De exporterar hjälpfunktioner som serversidor läser,
 * och i en klientfil hade de slutat vara funktioner där.
 *
 * Ett fel kan hinna inträffa innan React tagit över sidan, och då kommer
 * onError aldrig. Därför prövas bilden också en gång när komponenten monterats.
 */
export default function ImageWithFallback({
  src,
  className,
  style,
  fallback,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // En ny adress får en ny chans.
  useEffect(() => setFailed(false), [src]);

  useEffect(() => {
    const image = ref.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (failed) return <>{fallback}</>;

  return (
    // Vanlig img och inte next/image: bilden ligger bakom en
    // behörighetskontroll och kan inte optimeras i förväg av ramverket.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      style={style}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
