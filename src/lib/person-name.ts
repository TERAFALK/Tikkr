/**
 * PERSONENS NAMN: TVÅ FÄLT, ETT VISNINGSNAMN.
 *
 * Förnamn och efternamn ligger i varsin kolumn på `admin_users` sedan
 * 2026-10-11 (issue #16). Var ett enda `name`, och kunderna skrev då bara
 * förnamnet — en arbetsyta med två administratörer som båda heter Anna gick
 * inte att skilja åt, varken på kundkortet i plattformspanelen eller av den
 * som ringer supporten.
 *
 * VISNINGSNAMNET LAGRAS INTE. Det räknas fram här, vid varje läsning, av samma
 * skäl som orderns beräknade tid aldrig lagras (CLAUDE.md § 3 regel 6): ett
 * sammanslaget fält bredvid de två hinner alltid sluta säga samma sak, och
 * felet syns först som ett namn som inte stämmer med fälten man just sparat.
 *
 * FILEN HAR INGA IMPORTER. Den läses från båda hållen — kundens panel,
 * plattformspanelen, inbjudan och registreringen — precis som `modules.ts` och
 * `brand.ts`, och ska inte dra in något från endera sidan.
 */

/**
 * Kortare än så är inte ett namn, och ett tecken är nästan alltid en
 * felskrivning. Gäller båda fälten var för sig.
 */
export const MIN_NAME_LENGTH = 2;

/** Det som behövs för att skriva ut ett namn. Båda kan saknas. */
export interface PersonName {
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Namnet som det ska stå på skärmen, eller null när inget är ifyllt.
 *
 * Null och inte tom sträng: den som läser ska behöva välja vad som står i
 * stället, och varje ställe som visar ett namn har redan ett svar på det —
 * e-postadressen. En tom sträng hade smugit igenom som ett namn och lämnat ett
 * hål i en lista.
 */
export function fullName(person: PersonName): string | null {
  const parts = [person.firstName, person.lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Kontrollerar ett namn som KRÄVS, och svarar med ett meddelande skrivet för
 * att läsas av en människa.
 *
 * Ett led per fel och inte båda på en gång: den som glömt efternamnet ska se
 * vad som saknas, inte en lista.
 */
export function nameProblem(person: PersonName): string | null {
  if ((person.firstName ?? "").trim().length < MIN_NAME_LENGTH) {
    return "Ange ditt förnamn.";
  }

  if ((person.lastName ?? "").trim().length < MIN_NAME_LENGTH) {
    return "Ange ditt efternamn.";
  }

  return null;
}

/**
 * Formens värde så som det ska lagras: trimmat, och null när fältet lämnats
 * tomt.
 *
 * Både registreringen, inbjudan och Ditt konto skriver samma två fält, och
 * tomt betyder null på alla tre. Skrevs trimningen på plats i var och en vore
 * det tre ställen där ett mellanslag kan slinka med in i databasen.
 */
export function storedName(person: PersonName): {
  firstName: string | null;
  lastName: string | null;
} {
  return {
    firstName: (person.firstName ?? "").trim() || null,
    lastName: (person.lastName ?? "").trim() || null,
  };
}
