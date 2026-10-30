/**
 * VALEN I RUTAN SOM ÄNDRAR EN STÄMPLING.
 *
 * Ett avaktiverat moment går inte att boka ny tid på, och står därför inte
 * bland valen. Men en BEFINTLIG post behåller sitt eget moment i listan,
 * avaktiverat eller inte. Föll det bort skulle rutan visa ett annat moment som
 * valt, och ett sparat formulär flytta tiden dit — tyst, på ett underlag som
 * kanske redan fakturerats.
 *
 * Gäller arbetsmoment och improduktiva moment lika. Filen har inga importer:
 * den läses av en klientkomponent och ska inte dra något med sig dit.
 */

export interface PickableMoment {
  id: string;
  name: string;
  active: boolean;
}

export function momentOptionsFor(
  moments: PickableMoment[],
  currentId: string | null
): { id: string; label: string }[] {
  return moments
    .filter((moment) => moment.active || moment.id === currentId)
    .map((moment) => ({
      id: moment.id,
      label: moment.active ? moment.name : `${moment.name} (avaktiverat)`,
    }));
}
